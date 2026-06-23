import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { fetchWithTimeout } from '~/utils/fetchWithTimeout';
import { isAllowedUrl } from '~/utils/url';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.search');

const MAX_CONTENT_LENGTH = 8000;

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

/*
 * =====================
 *  URL detection
 * =====================
 */

function looksLikeUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/*
 * =====================
 *  Scrape helpers
 * =====================
 */

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : '';
}

function extractMetaDescription(html: string): string {
  const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*?)["'][^>]*>/i);

  if (match) {
    return match[1].trim();
  }

  // Try reverse attribute order
  const altMatch = html.match(/<meta[^>]*content=["']([^"']*?)["'][^>]*name=["']description["'][^>]*>/i);

  return altMatch ? altMatch[1].trim() : '';
}

function extractTextContent(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function handleScrape(url: string) {
  if (!isAllowedUrl(url)) {
    return json({ error: 'URL is not allowed. Only public HTTP/HTTPS URLs are accepted.' }, { status: 400 });
  }

  const response = await fetchWithTimeout(url, {
    headers: FETCH_HEADERS,
    timeoutMs: 10000,
  });

  if (!response.ok) {
    return json({ error: `Failed to fetch URL: ${response.status} ${response.statusText}` }, { status: 502 });
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    return json({ error: 'URL must point to an HTML or text page' }, { status: 400 });
  }

  const html = await response.text();
  const title = extractTitle(html);
  const description = extractMetaDescription(html);
  const content = extractTextContent(html);

  return json({
    success: true,
    mode: 'scrape' as const,
    data: {
      title,
      description,
      content: content.length > MAX_CONTENT_LENGTH ? content.slice(0, MAX_CONTENT_LENGTH) + '...' : content,
      sourceUrl: url,
    },
  });
}

/*
 * =====================
 *  DuckDuckGo search
 * =====================
 */

interface DuckDuckGoTopic {
  Text?: string;
  FirstURL?: string;
  Result?: string;
  Topics?: DuckDuckGoTopic[];
}

interface DuckDuckGoResponse {
  Abstract?: string;
  AbstractText?: string;
  AbstractSource?: string;
  AbstractURL?: string;
  Heading?: string;
  Answer?: string;
  AnswerType?: string;
  RelatedTopics?: DuckDuckGoTopic[];
  Results?: DuckDuckGoTopic[];
}

function parseDuckDuckGoResponse(ddg: DuckDuckGoResponse, query: string) {
  const results: Array<{ text: string; url: string }> = [];

  // Collect from RelatedTopics (may contain nested Topics groups)
  if (ddg.RelatedTopics) {
    for (const topic of ddg.RelatedTopics) {
      if (topic.Text && topic.FirstURL) {
        results.push({ text: topic.Text, url: topic.FirstURL });
      }

      if (topic.Topics) {
        for (const sub of topic.Topics) {
          if (sub.Text && sub.FirstURL) {
            results.push({ text: sub.Text, url: sub.FirstURL });
          }
        }
      }
    }
  }

  // Collect from Results
  if (ddg.Results) {
    for (const r of ddg.Results) {
      if (r.Text && r.FirstURL) {
        results.push({ text: r.Text, url: r.FirstURL });
      }
    }
  }

  return {
    heading: ddg.Heading || '',
    abstractText: ddg.AbstractText || '',
    abstractSource: ddg.AbstractSource || '',
    abstractUrl: ddg.AbstractURL || '',
    answer: ddg.Answer || '',
    results: results.slice(0, 20),
    query,
  };
}

async function handleSearch(query: string) {
  const encodedQuery = encodeURIComponent(query);
  const ddgUrl = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1`;

  const response = await fetchWithTimeout(ddgUrl, {
    headers: {
      'User-Agent': FETCH_HEADERS['User-Agent'],
      Accept: 'application/json',
    },
    timeoutMs: 10000,
  });

  if (!response.ok) {
    return json({ error: `DuckDuckGo API error: ${response.status} ${response.statusText}` }, { status: 502 });
  }

  const ddgData = (await response.json()) as DuckDuckGoResponse;
  const parsed = parseDuckDuckGoResponse(ddgData, query);

  return json({
    success: true,
    mode: 'search' as const,
    data: parsed,
  });
}

/*
 * =====================
 *  Route action
 * =====================
 */

async function webSearchAction({ request }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as { query?: string; url?: string; mode?: 'search' | 'scrape' };

    // Support both old `url` parameter and new `query` parameter
    const input = body.query || body.url;

    if (!input || typeof input !== 'string') {
      return json({ error: 'A "query" (for search) or "url" (for scraping) is required' }, { status: 400 });
    }

    // Determine mode: explicit > auto-detect (URL → scrape, plain text → search)
    const mode = body.mode ?? (looksLikeUrl(input) ? 'scrape' : 'search');

    if (mode === 'scrape') {
      return await handleScrape(input);
    }

    return await handleSearch(input);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return json({ error: 'Request timed out after 10 seconds' }, { status: 504 });
    }

    logger.error('Search error:', error);

    // Network/fetch failures are upstream errors (Bad Gateway), not internal server errors
    if (error instanceof TypeError || (error instanceof Error && error.message.includes('fetch'))) {
      return json({ error: error instanceof Error ? error.message : 'Failed to fetch' }, { status: 502 });
    }

    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}

export const action = withSecurity(webSearchAction, { allowedMethods: ['POST'] });
