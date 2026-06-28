import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { streamText, getCompletionTokenLimit } from '~/lib/.server/llm/stream-text';
import type { IProviderSetting, ProviderInfo } from '~/types/model';
import { generateText } from 'ai';
import { PROVIDER_LIST } from '~/utils/constants';
import { isReasoningModel } from '~/lib/.server/llm/constants';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { getApiKeysFromVault } from '~/lib/.server/api-key-vault';
import { getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { createScopedLogger } from '~/utils/logger';
import { getServerEnv } from '~/utils/env';

export const action = withSecurity(llmCallAction, { allowedMethods: ['POST'] });

async function getModelList(options: {
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
  serverEnv?: Env;
}) {
  const llmManager = LLMManager.getInstance(import.meta.env);
  return llmManager.updateModelList(options);
}

const logger = createScopedLogger('api.llmcall');

async function llmCallAction({ context, request }: ActionFunctionArgs) {
  let system: string;
  let message: string;
  let model: string;
  let provider: ProviderInfo;
  let streamOutput: boolean | undefined;

  try {
    ({ system, message, model, provider, streamOutput } = await request.json<{
      system: string;
      message: string;
      model: string;
      provider: ProviderInfo;
      streamOutput?: boolean;
    }>());
  } catch {
    return new Response(JSON.stringify({ error: true, message: 'Invalid or malformed JSON in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { name: providerName } = provider;

  // validate 'model' and 'provider' fields
  if (!model || typeof model !== 'string') {
    return new Response(JSON.stringify({ error: true, message: 'Invalid or missing model' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!providerName || typeof providerName !== 'string') {
    return new Response(JSON.stringify({ error: true, message: 'Invalid or missing provider' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cookieHeader = request.headers.get('Cookie');
  const env = getServerEnv(context);
  const apiKeys = await getApiKeysFromVault(cookieHeader, env);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  if (streamOutput) {
    try {
      const result = await streamText({
        options: {
          system,
        },
        messages: [
          {
            role: 'user',
            content: `${message}`,
          },
        ],
        env: context.cloudflare?.env,
        apiKeys,
        providerSettings,
      });

      /*
       * Wrap stream with error handling — if the provider errors mid-stream,
       * we append an error marker so the client knows the response is incomplete.
       */
      const safeStream = result.textStream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            controller.enqueue(chunk);
          },
          flush(controller) {
            controller.terminate();
          },
        }),
      );

      return new Response(safeStream, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    } catch (error: unknown) {
      logger.debug(error);

      if (error instanceof Error && error.message?.includes('API key')) {
        return new Response('Invalid or missing API key', {
          status: 401,
          statusText: 'Unauthorized',
        });
      }

      // Handle token limit errors with helpful messages
      if (
        error instanceof Error &&
        (error.message?.includes('max_tokens') ||
          error.message?.includes('token') ||
          error.message?.includes('exceeds') ||
          error.message?.includes('maximum'))
      ) {
        return new Response(
          `Token limit error: ${error.message}. Try reducing your request size or using a model with higher token limits.`,
          {
            status: 400,
            statusText: 'Token Limit Exceeded',
          },
        );
      }

      return new Response(null, {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
  } else {
    try {
      const models = await getModelList({
        apiKeys,
        providerSettings,
        serverEnv: context.cloudflare?.env,
      });
      const modelDetails = models.find((m: ModelInfo) => m.name === model);

      if (!modelDetails) {
        return new Response(
          JSON.stringify({
            error: true,
            message: `Model "${model}" not found. Please check the model name and try again.`,
            statusCode: 400,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const dynamicMaxTokens = getCompletionTokenLimit(modelDetails);

      const providerInfo = PROVIDER_LIST.find((p) => p.name === provider.name);

      if (!providerInfo) {
        throw new Error('Provider not found');
      }

      logger.info(`Generating response Provider: ${provider.name}, Model: ${modelDetails.name}`);

      // Log reasoning model detection
      const isReasoning = isReasoningModel(modelDetails.name);
      logger.debug(`Model "${modelDetails.name}" detected as reasoning model: ${isReasoning}`);

      // Use maxCompletionTokens for reasoning models (o1, GPT-5), maxTokens for traditional models
      const tokenParams = isReasoning ? { maxCompletionTokens: dynamicMaxTokens } : { maxTokens: dynamicMaxTokens };

      // Filter out unsupported parameters for reasoning models
      const baseParams = {
        system,
        messages: [
          {
            role: 'user' as const,
            content: `${message}`,
          },
        ],
        model: providerInfo.getModelInstance({
          model: modelDetails.name,
          serverEnv: context.cloudflare?.env,
          apiKeys,
          providerSettings,
        }),
        ...tokenParams,
        toolChoice: 'none' as const,
      };

      // For reasoning models, set temperature to 1 (required by OpenAI API)
      const finalParams = isReasoning
        ? { ...baseParams, temperature: 1 } // Set to 1 for reasoning models (only supported value)
        : { ...baseParams, temperature: 0 };

      // Log reasoning model parameters
      logger.debug(
        `Final params for model "${modelDetails.name}":`,
        JSON.stringify(
          {
            isReasoning,
            hasTemperature: 'temperature' in finalParams,
            hasMaxTokens: 'maxTokens' in finalParams,
            hasMaxCompletionTokens: 'maxCompletionTokens' in finalParams,
            paramKeys: Object.keys(finalParams).filter((key) => !['model', 'messages', 'system'].includes(key)),
            tokenParams,
            finalParams: Object.fromEntries(
              Object.entries(finalParams).filter(([key]) => !['model', 'messages', 'system'].includes(key)),
            ),
          },
          null,
          2,
        ),
      );

      const result = await generateText(finalParams);
      logger.info(`Generated response`);

      /*
       * v6 SDK's generateText result has `text` as a getter that may not
       * survive JSON.stringify. Extract it explicitly for the client.
       */
      return new Response(JSON.stringify({ text: result.text ?? '' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error: unknown) {
      logger.debug(error);

      const errorRecord = error as Record<string, unknown>;
      const errorResponse = {
        error: true,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        statusCode: (typeof errorRecord.statusCode === 'number' ? errorRecord.statusCode : 500) as number,
        isRetryable: errorRecord.isRetryable !== false,
        provider: (typeof errorRecord.provider === 'string' ? errorRecord.provider : 'unknown') as string,
      };

      if (error instanceof Error && error.message?.includes('API key')) {
        return new Response(
          JSON.stringify({
            ...errorResponse,
            message: 'Invalid or missing API key',
            statusCode: 401,
            isRetryable: false,
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
            statusText: 'Unauthorized',
          },
        );
      }

      // Handle token limit errors with helpful messages
      if (
        error instanceof Error &&
        (error.message?.includes('max_tokens') ||
          error.message?.includes('token') ||
          error.message?.includes('exceeds') ||
          error.message?.includes('maximum'))
      ) {
        return new Response(
          JSON.stringify({
            ...errorResponse,
            message: `Token limit error: ${error.message}. Try reducing your request size or using a model with higher token limits.`,
            statusCode: 400,
            isRetryable: false,
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
            statusText: 'Token Limit Exceeded',
          },
        );
      }

      return new Response(JSON.stringify(errorResponse), {
        status: errorResponse.statusCode,
        headers: { 'Content-Type': 'application/json' },
        statusText: 'Error',
      });
    }
  }
}
