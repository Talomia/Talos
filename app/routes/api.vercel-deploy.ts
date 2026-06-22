import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { fetchWithTimeout } from '~/utils/fetchWithTimeout';
import type { VercelProjectInfo } from '~/types/vercel';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('vercel-deploy');

interface VercelProjectResponse {
  id: string;
  name: string;
}

interface VercelDeploymentItem {
  id: string;
  state: string;
  url?: string;
}

interface VercelDeploymentsResponse {
  deployments?: VercelDeploymentItem[];
}

interface VercelDeployResponse {
  id: string;
  url?: string;
  readyState?: string;
}

interface VercelErrorResponse {
  error?: { message?: string };
}

// Function to detect framework from project files
const detectFramework = (files: Record<string, string>): string => {
  // Check for package.json first
  const packageJson = files['package.json'];

  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson);
      const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };

      // Check for specific frameworks
      if (dependencies.next) {
        return 'nextjs';
      }

      if (dependencies.react && dependencies['@remix-run/react']) {
        return 'remix';
      }

      if (dependencies.react && dependencies.vite) {
        return 'vite';
      }

      if (dependencies.react && dependencies['@vitejs/plugin-react']) {
        return 'vite';
      }

      if (dependencies.react && dependencies['@nuxt/react']) {
        return 'nuxt';
      }

      if (dependencies.react && dependencies['@qwik-city/qwik']) {
        return 'qwik';
      }

      if (dependencies.react && dependencies['@sveltejs/kit']) {
        return 'sveltekit';
      }

      if (dependencies.react && dependencies.astro) {
        return 'astro';
      }

      if (dependencies.react && dependencies['@angular/core']) {
        return 'angular';
      }

      if (dependencies.react && dependencies.vue) {
        return 'vue';
      }

      if (dependencies.react && dependencies['@expo/react-native']) {
        return 'expo';
      }

      if (dependencies.react && dependencies['react-native']) {
        return 'react-native';
      }

      // Generic React app
      if (dependencies.react) {
        return 'react';
      }

      // Check for other frameworks
      if (dependencies['@angular/core']) {
        return 'angular';
      }

      if (dependencies.vue) {
        return 'vue';
      }

      if (dependencies['@sveltejs/kit']) {
        return 'sveltekit';
      }

      if (dependencies.astro) {
        return 'astro';
      }

      if (dependencies['@nuxt/core']) {
        return 'nuxt';
      }

      if (dependencies['@qwik-city/qwik']) {
        return 'qwik';
      }

      if (dependencies['@expo/react-native']) {
        return 'expo';
      }

      if (dependencies['react-native']) {
        return 'react-native';
      }

      // Check for build tools
      if (dependencies.vite) {
        return 'vite';
      }

      if (dependencies.webpack) {
        return 'webpack';
      }

      if (dependencies.parcel) {
        return 'parcel';
      }

      if (dependencies.rollup) {
        return 'rollup';
      }

      // Default to Node.js if package.json exists
      return 'nodejs';
    } catch (error) {
      logger.error('Error parsing package.json:', error);
    }
  }

  // Check for other framework indicators
  if (files['next.config.js'] || files['next.config.ts']) {
    return 'nextjs';
  }

  if (files['remix.config.js'] || files['remix.config.ts']) {
    return 'remix';
  }

  if (files['vite.config.js'] || files['vite.config.ts']) {
    return 'vite';
  }

  if (files['nuxt.config.js'] || files['nuxt.config.ts']) {
    return 'nuxt';
  }

  if (files['svelte.config.js'] || files['svelte.config.ts']) {
    return 'sveltekit';
  }

  if (files['astro.config.js'] || files['astro.config.ts']) {
    return 'astro';
  }

  if (files['angular.json']) {
    return 'angular';
  }

  if (files['vue.config.js'] || files['vue.config.ts']) {
    return 'vue';
  }

  if (files['app.json'] && files['app.json'].includes('expo')) {
    return 'expo';
  }

  if (files['app.json'] && files['app.json'].includes('react-native')) {
    return 'react-native';
  }

  // Check for static site indicators
  if (files['index.html']) {
    return 'static';
  }

  // Default to unknown
  return 'other';
};

// Add loader function to handle GET requests
async function vercelDeployLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');

  /*
   * Read token from Authorization header instead of URL query params
   * to prevent it from leaking into logs, browser history, and referrer headers.
   */
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!projectId || !token) {
    return json({ error: 'Missing projectId or token' }, { status: 400 });
  }

  if (typeof projectId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    return json({ error: 'Invalid project ID format' }, { status: 400 });
  }

  try {
    // Get project info
    const projectResponse = await fetchWithTimeout(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeoutMs: 30000,
      },
    );

    if (!projectResponse.ok) {
      return json({ error: 'Failed to fetch project' }, { status: 400 });
    }

    const projectData = (await projectResponse.json()) as VercelProjectResponse;

    // Get latest deployment
    const deploymentsResponse = await fetchWithTimeout(
      `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeoutMs: 30000,
      },
    );

    if (!deploymentsResponse.ok) {
      return json({ error: 'Failed to fetch deployments' }, { status: 400 });
    }

    const deploymentsData = (await deploymentsResponse.json()) as VercelDeploymentsResponse;

    const latestDeployment = deploymentsData.deployments?.[0];

    return json({
      project: {
        id: projectData.id,
        name: projectData.name,
        url: `https://${projectData.name}.vercel.app`,
      },
      deploy: latestDeployment
        ? {
            id: latestDeployment.id,
            state: latestDeployment.state,
            url: latestDeployment.url ? `https://${latestDeployment.url}` : `https://${projectData.name}.vercel.app`,
          }
        : null,
    });
  } catch (error) {
    logger.error('Error fetching Vercel deployment:', error);
    return json({ error: 'Failed to fetch deployment' }, { status: 500 });
  }
}

interface DeployRequestBody {
  projectId?: string;
  files: Record<string, string>;
  sourceFiles?: Record<string, string>;
  chatId: string;
  framework?: string;
}

// Existing action function for POST requests
async function vercelDeployAction({ request }: ActionFunctionArgs) {
  try {
    const { projectId, files, sourceFiles, token, chatId, framework } = (await request.json()) as DeployRequestBody & {
      token: string;
    };

    if (!token) {
      return json({ error: 'Not connected to Vercel' }, { status: 401 });
    }

    let targetProjectId = projectId;
    let projectInfo: VercelProjectInfo | undefined;

    // Sanitize chatId for use in project names
    const safeChatId = (chatId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);

    // Detect framework from the source files if not provided
    let detectedFramework = framework;

    if (!detectedFramework && sourceFiles) {
      detectedFramework = detectFramework(sourceFiles);
      logger.debug('Detected framework from source files:', detectedFramework);
    }

    // If no projectId provided, create a new project
    if (!targetProjectId) {
      const projectName = `app-${safeChatId}-${Date.now()}`;
      const createProjectResponse = await fetchWithTimeout('https://api.vercel.com/v9/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: projectName,
          framework: detectedFramework || null,
        }),
        timeoutMs: 30000,
      });

      if (!createProjectResponse.ok) {
        const errorData = (await createProjectResponse.json()) as VercelErrorResponse;
        return json(
          { error: `Failed to create project: ${errorData.error?.message || 'Unknown error'}` },
          { status: 400 },
        );
      }

      const newProject = (await createProjectResponse.json()) as VercelProjectResponse;
      targetProjectId = newProject.id;
      projectInfo = {
        id: newProject.id,
        name: newProject.name,
        url: `https://${newProject.name}.vercel.app`,
        chatId,
      };
    } else {
      // Get existing project info
      const projectResponse = await fetchWithTimeout(`https://api.vercel.com/v9/projects/${targetProjectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeoutMs: 30000,
      });

      if (projectResponse.ok) {
        const existingProject = (await projectResponse.json()) as VercelProjectResponse;
        projectInfo = {
          id: existingProject.id,
          name: existingProject.name,
          url: `https://${existingProject.name}.vercel.app`,
          chatId,
        };
      } else {
        // If project doesn't exist, create a new one
        const projectName = `app-${safeChatId}-${Date.now()}`;
        const createProjectResponse = await fetchWithTimeout('https://api.vercel.com/v9/projects', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: projectName,
            framework: detectedFramework || null,
          }),
          timeoutMs: 30000,
        });

        if (!createProjectResponse.ok) {
          const errorData = (await createProjectResponse.json()) as VercelErrorResponse;
          return json(
            { error: `Failed to create project: ${errorData.error?.message || 'Unknown error'}` },
            { status: 400 },
          );
        }

        const newProject = (await createProjectResponse.json()) as VercelProjectResponse;
        targetProjectId = newProject.id;
        projectInfo = {
          id: newProject.id,
          name: newProject.name,
          url: `https://${newProject.name}.vercel.app`,
          chatId,
        };
      }
    }

    // Prepare files for deployment
    const deploymentFiles = [];

    /*
     * For frameworks that need to build on Vercel, include source files
     * For static sites, only include build output
     */
    const shouldIncludeSourceFiles =
      detectedFramework &&
      ['nextjs', 'react', 'vite', 'remix', 'nuxt', 'sveltekit', 'astro', 'vue', 'angular'].includes(detectedFramework);

    if (shouldIncludeSourceFiles && sourceFiles) {
      // Include source files for frameworks that need to build
      for (const [filePath, content] of Object.entries(sourceFiles)) {
        // Ensure file path doesn't start with a slash for Vercel
        const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        deploymentFiles.push({
          file: normalizedPath,
          data: content,
        });
      }
    } else {
      // For static sites, only include build output
      for (const [filePath, content] of Object.entries(files)) {
        // Ensure file path doesn't start with a slash for Vercel
        const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        deploymentFiles.push({
          file: normalizedPath,
          data: content,
        });
      }
    }

    // Create deployment configuration based on framework
    const deploymentConfig: any = {
      name: projectInfo.name,
      project: targetProjectId,
      target: 'production',
      files: deploymentFiles,
    };

    // Add framework-specific configuration
    if (detectedFramework === 'nextjs') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = '.next';
    } else if (detectedFramework === 'react' || detectedFramework === 'vite') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = 'dist';
    } else if (detectedFramework === 'remix') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = 'public';
    } else if (detectedFramework === 'nuxt') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = '.output';
    } else if (detectedFramework === 'sveltekit') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = 'build';
    } else if (detectedFramework === 'astro') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = 'dist';
    } else if (detectedFramework === 'vue') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = 'dist';
    } else if (detectedFramework === 'angular') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = 'dist';
    } else {
      // For static sites, no build command needed
      deploymentConfig.routes = [{ src: '/(.*)', dest: '/$1' }];
    }

    // Create a new deployment
    const deployResponse = await fetchWithTimeout(`https://api.vercel.com/v13/deployments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deploymentConfig),
      timeoutMs: 30000,
    });

    if (!deployResponse.ok) {
      const errorData = (await deployResponse.json()) as VercelErrorResponse;
      return json(
        { error: `Failed to create deployment: ${errorData.error?.message || 'Unknown error'}` },
        { status: 400 },
      );
    }

    const deployData = (await deployResponse.json()) as VercelDeployResponse;

    // Poll for deployment status
    let retryCount = 0;
    const maxRetries = 60;
    let deploymentUrl = '';
    let deploymentState = '';

    while (retryCount < maxRetries) {
      const statusResponse = await fetchWithTimeout(`https://api.vercel.com/v13/deployments/${deployData.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeoutMs: 30000,
      });

      if (statusResponse.ok) {
        const status = (await statusResponse.json()) as VercelDeployResponse;
        deploymentState = status.readyState ?? '';
        deploymentUrl = status.url ? `https://${status.url}` : '';

        if (status.readyState === 'READY' || status.readyState === 'ERROR') {
          break;
        }
      }

      retryCount++;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (deploymentState === 'ERROR') {
      return json({ error: 'Deployment failed' }, { status: 500 });
    }

    if (retryCount >= maxRetries) {
      return json({ error: 'Deployment timed out' }, { status: 500 });
    }

    return json({
      success: true,
      deploy: {
        id: deployData.id,
        state: deploymentState,

        // Return public domain as deploy URL and private domain as fallback.
        url: projectInfo.url || deploymentUrl,
      },
      project: projectInfo,
    });
  } catch (error) {
    logger.error('Vercel deploy error:', error);
    return json({ error: 'Deployment failed' }, { status: 500 });
  }
}

export const loader = withSecurity(vercelDeployLoader, { allowedMethods: ['GET'] });
export const action = withSecurity(vercelDeployAction, { allowedMethods: ['POST'] });
