import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { streamText } from '~/lib/.server/llm/stream-text';
import { stripIndents } from '~/utils/stripIndent';
import type { ProviderInfo } from '~/types/model';
import { getApiKeysFromVault } from '~/lib/.server/api-key-vault';
import { getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { createScopedLogger } from '~/utils/logger';

export const action = withSecurity(enhancerAction, { allowedMethods: ['POST'] });

const logger = createScopedLogger('api.enhancer');

async function enhancerAction({ context, request }: ActionFunctionArgs) {
  let message: string;
  let model: string;
  let provider: ProviderInfo;

  try {
    ({ message, model, provider } = await request.json<{
      message: string;
      model: string;
      provider: ProviderInfo;
      apiKeys?: Record<string, string>;
    }>());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid or malformed JSON in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // validate 'model' and 'provider' fields
  if (!model || typeof model !== 'string') {
    return new Response(JSON.stringify({ error: 'Invalid or missing model' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!provider || typeof provider !== 'object' || !provider.name || typeof provider.name !== 'string') {
    return new Response(JSON.stringify({ error: 'Invalid or missing provider' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { name: providerName } = provider;

  const cookieHeader = request.headers.get('Cookie');
  const env = (context?.cloudflare?.env as unknown as Record<string, string>) || {};
  const apiKeys = await getApiKeysFromVault(cookieHeader, env);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  try {
    const result = await streamText({
      messages: [
        {
          role: 'user',
          content:
            `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n` +
            stripIndents`
            You are a principal software architect who transforms vague ideas into buildable specifications.
            Your task is to enhance the user's prompt into a detailed technical specification.

            ALWAYS include these sections in your enhanced prompt:
            1. **Tech Stack**: Framework, language, key libraries (e.g., "React + Vite + TypeScript + Tailwind CSS")
            2. **Pages/Views**: List every screen with its purpose and key content
            3. **Component Architecture**: Name 6-12 specific components with their responsibilities
            4. **Data Model**: Define TypeScript interfaces for the main data structures
            5. **User Interactions**: Describe what happens on click, submit, hover, scroll
            6. **Mock Data**: Specify realistic sample data to populate the UI (names, dates, avatars)
            7. **Design Direction**: Color scheme, typography, layout approach, animations, dark/light mode

            Transform a vague idea like "Build a chat app" into a 20-30 line specification covering all 7 sections.
            The specification should be detailed enough that any developer could build it without asking questions.

            IMPORTANT: Your response must ONLY contain the enhanced prompt text.
            Do not include any explanations, metadata, section labels, or wrapper tags.
            Write it as a natural, flowing specification — not a structured template.

            <original_prompt>
              ${message}
            </original_prompt>
          `,
        },
      ],
      env: context.cloudflare?.env,
      apiKeys,
      providerSettings,
      options: {
        system:
          'You are a principal software architect who transforms vague application ideas into detailed, architecture-complete technical specifications. Your enhanced prompts consistently produce fully functional, production-ready applications when given to an AI coding assistant. You think in terms of components, data models, user flows, and visual design — not just features. Your response must ONLY contain the enhanced prompt text — no explanations, metadata, or wrapper tags.',

        /*
         * onError: (event) => {
         *   throw new Response(null, {
         *     status: 500,
         *     statusText: 'Internal Server Error',
         *   });
         * }
         */
      },
    });

    // Return the text stream directly since it's already text data
    return new Response(result.textStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: unknown) {
    logger.error(error);

    if (error instanceof Error && error.message?.includes('API key')) {
      return new Response('Invalid or missing API key', {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    return new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}
