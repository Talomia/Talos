import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { fetchWithTimeout } from '~/utils/fetchWithTimeout';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.netlify-deploy');

import type { NetlifySiteInfo } from '~/types/netlify';

interface DeployRequestBody {
  siteId?: string;
  files: Record<string, string>;
  chatId: string;
}

interface NetlifySiteResponse {
  id: string;
  name: string;
  url: string;
}

interface NetlifyDeployResponse {
  id: string;
  state: string;
  ssl_url?: string;
  url?: string;
  error_message?: string;
  required?: string[];
}

async function readNetlifyError(response: Response) {
  try {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = (await response.json()) as { message?: string; error?: string } | undefined;
      return data?.message || data?.error || JSON.stringify(data);
    }

    const text = await response.text();

    return text;
  } catch {
    return undefined;
  }
}

async function sha1Hex(content: string | Uint8Array): Promise<string> {
  const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);

  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function netlifyDeployAction({ request }: ActionFunctionArgs) {
  try {
    const { siteId, files, token, chatId } = (await request.json()) as DeployRequestBody & { token: string };

    if (!token) {
      return json({ error: 'Not connected to Netlify' }, { status: 401 });
    }

    // Validate siteId format if provided
    if (siteId && (typeof siteId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(siteId))) {
      return json({ error: 'Invalid site ID format' }, { status: 400 });
    }

    // Sanitize chatId for use in site names
    const safeChatId = (chatId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);

    let targetSiteId = siteId;
    let siteInfo: NetlifySiteInfo | undefined;

    // If no siteId provided, create a new site
    if (!targetSiteId) {
      const siteName = `app-${safeChatId}-${Date.now()}`;
      const createSiteResponse = await fetchWithTimeout('https://api.netlify.com/api/v1/sites', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: siteName,
          custom_domain: null,
        }),
        timeoutMs: 30000,
      });

      if (!createSiteResponse.ok) {
        const errorDetail = await readNetlifyError(createSiteResponse);
        return json(
          { error: `Failed to create site${errorDetail ? `: ${errorDetail}` : ''}` },
          { status: createSiteResponse.status },
        );
      }

      const newSite = (await createSiteResponse.json()) as NetlifySiteResponse;
      targetSiteId = newSite.id;
      siteInfo = {
        id: newSite.id,
        name: newSite.name,
        url: newSite.url,
        chatId,
      };
    } else {
      // Get existing site info
      if (targetSiteId) {
        const siteResponse = await fetchWithTimeout(
          `https://api.netlify.com/api/v1/sites/${encodeURIComponent(targetSiteId)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            timeoutMs: 30000,
          },
        );

        if (siteResponse.ok) {
          const existingSite = (await siteResponse.json()) as NetlifySiteResponse;
          siteInfo = {
            id: existingSite.id,
            name: existingSite.name,
            url: existingSite.url,
            chatId,
          };
        } else {
          targetSiteId = undefined;
        }
      }

      // If no siteId provided or site doesn't exist, create a new site
      if (!targetSiteId) {
        const siteName = `app-${safeChatId}-${Date.now()}`;
        const createSiteResponse = await fetchWithTimeout('https://api.netlify.com/api/v1/sites', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: siteName,
            custom_domain: null,
          }),
          timeoutMs: 30000,
        });

        if (!createSiteResponse.ok) {
          const errorDetail = await readNetlifyError(createSiteResponse);
          return json(
            { error: `Failed to create site${errorDetail ? `: ${errorDetail}` : ''}` },
            { status: createSiteResponse.status },
          );
        }

        const newSite = (await createSiteResponse.json()) as NetlifySiteResponse;
        targetSiteId = newSite.id;
        siteInfo = {
          id: newSite.id,
          name: newSite.name,
          url: newSite.url,
          chatId,
        };
      }
    }

    // Create file digests
    const fileDigests: Record<string, string> = {};

    for (const [filePath, content] of Object.entries(files)) {
      // Ensure file path starts with a forward slash
      const normalizedPath = filePath.startsWith('/') ? filePath : '/' + filePath;
      const hash = await sha1Hex(content);
      fileDigests[normalizedPath] = hash;
    }

    // Create a new deploy with digests
    const deployResponse = await fetchWithTimeout(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(targetSiteId)}/deploys`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: fileDigests,
          async: true,
          skip_processing: false,
          draft: false, // Change this to false for production deployments
          function_schedules: [],
          framework: null,
        }),
        timeoutMs: 30000,
      },
    );

    if (!deployResponse.ok) {
      const errorDetail = await readNetlifyError(deployResponse);
      return json(
        { error: `Failed to create deployment${errorDetail ? `: ${errorDetail}` : ''}` },
        { status: deployResponse.status },
      );
    }

    const deploy = (await deployResponse.json()) as NetlifyDeployResponse;
    let retryCount = 0;
    const maxRetries = 30;
    let filesUploaded = false;

    // Poll until deploy is ready for file uploads
    while (retryCount < maxRetries) {
      const statusResponse = await fetchWithTimeout(
        `https://api.netlify.com/api/v1/sites/${encodeURIComponent(targetSiteId)}/deploys/${encodeURIComponent(deploy.id)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeoutMs: 15000,
        },
      );

      if (!statusResponse.ok) {
        const errorDetail = await readNetlifyError(statusResponse);
        return json(
          { error: `Failed to check deployment status${errorDetail ? `: ${errorDetail}` : ''}` },
          { status: statusResponse.status },
        );
      }

      const status = (await statusResponse.json()) as NetlifyDeployResponse;

      if (!filesUploaded && (status.state === 'prepared' || status.state === 'uploaded')) {
        // Upload all files regardless of required array
        for (const [filePath, content] of Object.entries(files)) {
          const normalizedPath = filePath.startsWith('/') ? filePath : '/' + filePath;
          const encodedPath = normalizedPath
            .split('/')
            .map((segment) => encodeURIComponent(segment))
            .join('/');

          let uploadSuccess = false;
          let uploadRetries = 0;

          while (!uploadSuccess && uploadRetries < 3) {
            try {
              const uploadResponse = await fetchWithTimeout(
                `https://api.netlify.com/api/v1/deploys/${encodeURIComponent(deploy.id)}/files${encodedPath}`,
                {
                  method: 'PUT',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/octet-stream',
                  },
                  body: content,
                  timeoutMs: 30000,
                },
              );

              uploadSuccess = uploadResponse.ok;

              if (!uploadSuccess) {
                logger.error('Upload failed:', await uploadResponse.text());
                uploadRetries++;
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
            } catch (error) {
              logger.error('Upload error:', error);
              uploadRetries++;
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          }

          if (!uploadSuccess) {
            return json({ error: `Failed to upload file ${filePath}` }, { status: 500 });
          }
        }

        filesUploaded = true;
      }

      if (status.state === 'ready') {
        // Only return after files are uploaded
        return json({
          success: true,
          deploy: {
            id: status.id,
            state: status.state,
            url: status.ssl_url || status.url,
          },
          site: siteInfo,
        });
      }

      if (status.state === 'error') {
        return json({ error: status.error_message || 'Deploy preparation failed' }, { status: 500 });
      }

      retryCount++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (retryCount >= maxRetries) {
      // Deployment is still in progress — return what we have so far
      logger.info(`Netlify deploy ${deploy.id} still in progress after polling timeout`);

      return json({
        success: true,
        deploy: {
          id: deploy.id,
          state: 'building',
          url: siteInfo?.url || `https://app.netlify.com/deploys/${deploy.id}`,
        },
        site: siteInfo,
        note: 'Deployment is still in progress. Check your Netlify dashboard for the final status.',
      });
    }

    // Make sure we're returning the deploy ID and site info
    return json({
      success: true,
      deploy: {
        id: deploy.id,
        state: deploy.state,
      },
      site: siteInfo,
    });
  } catch (error) {
    logger.error('Deploy error:', error);
    return json({ error: 'Deployment failed' }, { status: 500 });
  }
}

export const action = withSecurity(netlifyDeployAction, { allowedMethods: ['POST'] });
