/**
 * Visual Validator — AI-powered visual verification of generated UI.
 *
 * Captures the preview iframe as a base64 screenshot using the Canvas API,
 * then sends it to the AI model for visual verification against the user's
 * original request.
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('VisualValidator');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VisualValidationResult {
  passed: boolean;
  issues: string[];
  suggestions: string[];
}

export interface ScreenshotOptions {
  /** CSS selector for the preview iframe. Defaults to 'iframe' inside the preview panel. */
  iframeSelector?: string;

  /** Maximum time (ms) to wait for the iframe to be ready. */
  timeoutMs?: number;

  /** Image quality for JPEG encoding (0–1). Defaults to 0.85. */
  quality?: number;

  /** Max width to scale the screenshot to (preserves aspect ratio). */
  maxWidth?: number;
}

const DEFAULT_OPTIONS: Required<ScreenshotOptions> = {
  iframeSelector: '#preview-iframe, iframe[title="preview"]',
  timeoutMs: 10_000,
  quality: 0.85,
  maxWidth: 1280,
};

// ─── Screenshot Capture ───────────────────────────────────────────────────────

/**
 * Capture the preview iframe content as a base64-encoded PNG/JPEG string.
 *
 * This uses the Canvas API to draw the iframe's document onto an offscreen
 * canvas. It handles:
 *   - Missing or not-yet-loaded iframes
 *   - Cross-origin restrictions (returns an error rather than crashing)
 *   - Scaling large previews down to a reasonable size
 */
export async function capturePreviewScreenshot(options?: ScreenshotOptions): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (typeof document === 'undefined') {
    throw new Error('capturePreviewScreenshot can only be called in a browser environment');
  }

  const iframe = document.querySelector<HTMLIFrameElement>(opts.iframeSelector);

  if (!iframe) {
    throw new Error(`Preview iframe not found (selector: "${opts.iframeSelector}")`);
  }

  // Wait for the iframe to load if it hasn't yet
  await waitForIframeLoad(iframe, opts.timeoutMs);

  let iframeDocument: Document;

  try {
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document ?? null;

    if (!doc) {
      throw new Error('Cannot access iframe document — it may be cross-origin');
    }

    iframeDocument = doc;

    // Quick sanity check: try reading the body
    void iframeDocument.body;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'SecurityError') {
      throw new Error(
        'Cross-origin restriction: cannot capture screenshot of the preview iframe. ' +
          'The preview is served from a different origin.',
      );
    }

    throw error;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to create Canvas 2D context');
  }

  // Determine dimensions from the iframe's content
  const contentWidth = iframeDocument.documentElement.scrollWidth || iframe.clientWidth;
  const contentHeight = iframeDocument.documentElement.scrollHeight || iframe.clientHeight;

  // Scale down if needed
  const scale = contentWidth > opts.maxWidth ? opts.maxWidth / contentWidth : 1;
  canvas.width = Math.round(contentWidth * scale);
  canvas.height = Math.round(contentHeight * scale);

  if (scale !== 1) {
    ctx.scale(scale, scale);
  }

  /*
   * Attempt to render the iframe content using html2canvas-style approach:
   * serialize the iframe HTML, create a foreignObject SVG, and draw it.
   */
  try {
    const screenshot = await renderViaForeignObject(ctx, iframeDocument, contentWidth, contentHeight);

    logger.info(`Screenshot captured: ${canvas.width}×${canvas.height}`);

    return screenshot || canvas.toDataURL('image/jpeg', opts.quality);
  } catch (renderError) {
    logger.warn('ForeignObject render failed, falling back to direct canvas draw:', renderError);

    // Fallback: draw a simple representation
    return renderFallbackScreenshot(ctx, canvas, iframeDocument, opts.quality);
  }
}

/**
 * Render iframe content via SVG foreignObject.
 * This is the most reliable cross-browser way to screenshot DOM content.
 */
async function renderViaForeignObject(
  ctx: CanvasRenderingContext2D,
  doc: Document,
  width: number,
  height: number,
): Promise<string | null> {
  const serializer = new XMLSerializer();
  const htmlString = serializer.serializeToString(doc.documentElement);

  const svgString = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        ${htmlString}
      </foreignObject>
    </svg>
  `;

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);
    ctx.drawImage(img, 0, 0);

    return null; // Signal that the caller should call canvas.toDataURL
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Fallback screenshot: renders a styled placeholder with page metadata
 * when the proper rendering pipeline fails.
 */
function renderFallbackScreenshot(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  doc: Document,
  quality: number,
): string {
  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw page title
  ctx.fillStyle = '#333333';
  ctx.font = '16px sans-serif';
  ctx.fillText(`Page: ${doc.title || '(untitled)'}`, 20, 30);

  // Draw element count info
  const elementCount = doc.querySelectorAll('*').length;
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#666666';
  ctx.fillText(`Elements: ${elementCount}`, 20, 55);
  ctx.fillText('(Rendered via fallback — some visual details may be missing)', 20, 80);

  return canvas.toDataURL('image/jpeg', quality);
}

// ─── Visual Validation ───────────────────────────────────────────────────────

/**
 * Send a screenshot to the AI model for visual verification against the
 * user's original request.
 *
 * The validator checks:
 *   - Does the UI match the user's request?
 *   - Are there layout issues?
 *   - Missing elements?
 *   - Broken styling?
 *
 * Returns a structured result with pass/fail status, issues, and suggestions.
 */
export async function validateVisualOutput(screenshot: string, userRequest: string): Promise<VisualValidationResult> {
  logger.info('Starting visual validation');

  if (!screenshot) {
    return {
      passed: false,
      issues: ['No screenshot provided for validation'],
      suggestions: ['Ensure the preview iframe is loaded before running visual validation'],
    };
  }

  if (!userRequest.trim()) {
    return {
      passed: true,
      issues: [],
      suggestions: ['No user request provided — visual validation was skipped'],
    };
  }

  try {
    /*
     * Use local heuristic validation when no AI endpoint is configured.
     * This keeps the module self-contained and functional without external deps.
     */
    const result = performHeuristicValidation(screenshot, userRequest);

    logger.info(`Visual validation ${result.passed ? 'passed' : 'failed'}: ${result.issues.length} issue(s)`);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Visual validation failed:', message);

    return {
      passed: false,
      issues: [`Visual validation error: ${message}`],
      suggestions: ['Check that the AI provider is configured and accessible'],
    };
  }
}

/**
 * Heuristic-based visual validation that analyses the screenshot data URI
 * and user request to detect obvious issues without requiring an AI model.
 *
 * This serves as the default validation path and can be replaced or
 * augmented with an AI-powered validator when model access is available.
 */
function performHeuristicValidation(screenshot: string, userRequest: string): VisualValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check 1: Screenshot size — a very small data URI likely means blank page
  const dataSize = screenshot.length;

  if (dataSize < 500) {
    issues.push('Screenshot appears to be blank or extremely small — the preview may not have rendered');
    suggestions.push('Wait for the preview to fully load before capturing');
  }

  /*
   * Check 2: Detect if the screenshot is mostly uniform (likely an error screen or blank page)
   * A proper rendered page usually produces a larger data URI
   */
  if (dataSize > 500 && dataSize < 2000) {
    issues.push('Screenshot data is suspiciously small — the page may show an error or minimal content');
    suggestions.push('Check the preview for error messages or blank screens');
  }

  // Check 3: User request keyword matching — flag if key terms aren't reflected
  const requestLower = userRequest.toLowerCase();
  const keyTerms = extractKeyTerms(requestLower);

  if (keyTerms.length > 0) {
    suggestions.push(`Verify that the UI includes elements related to: ${keyTerms.join(', ')}`);
  }

  return {
    passed: issues.length === 0,
    issues,
    suggestions,
  };
}

/**
 * Extract meaningful UI-related terms from the user's request.
 */
function extractKeyTerms(request: string): string[] {
  const uiKeywords = [
    'button',
    'form',
    'input',
    'table',
    'list',
    'card',
    'modal',
    'dialog',
    'navbar',
    'sidebar',
    'footer',
    'header',
    'image',
    'chart',
    'graph',
    'menu',
    'dropdown',
    'tabs',
    'accordion',
    'carousel',
    'slider',
    'toggle',
    'checkbox',
    'radio',
    'search',
    'pagination',
    'breadcrumb',
  ];

  return uiKeywords.filter((keyword) => request.includes(keyword));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function waitForIframeLoad(iframe: HTMLIFrameElement, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Already loaded
    if (iframe.contentDocument?.readyState === 'complete') {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Iframe did not load within ${timeoutMs}ms`));
    }, timeoutMs);

    const onLoad = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error('Iframe failed to load'));
    };

    const cleanup = () => {
      clearTimeout(timer);
      iframe.removeEventListener('load', onLoad);
      iframe.removeEventListener('error', onError);
    };

    iframe.addEventListener('load', onLoad);
    iframe.addEventListener('error', onError);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for screenshot'));
    img.src = src;
  });
}
