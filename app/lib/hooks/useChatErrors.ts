import { useCallback, useState } from 'react';
import type { JSONValue } from 'ai';
import { createScopedLogger } from '~/utils/logger';
import { logStore } from '~/lib/stores/logs';
import type { LlmErrorAlertType } from '~/types/actions';

const logger = createScopedLogger('Chat');

export interface UseChatErrorsDeps {
  providerName: string;
  stop: () => void;
  setFakeLoading: (loading: boolean) => void;
  setData: (data: JSONValue[] | undefined) => void;
}

export interface UseChatErrorsReturn {
  llmErrorAlert: LlmErrorAlertType | undefined;
  clearLlmErrorAlert: () => void;
  handleError: (error: Error | { message?: string }, context?: 'chat' | 'template' | 'llmcall') => void;
}

export function useChatErrors({ providerName, stop, setFakeLoading, setData }: UseChatErrorsDeps): UseChatErrorsReturn {
  const [llmErrorAlert, setLlmErrorAlert] = useState<LlmErrorAlertType | undefined>(undefined);

  const handleError = useCallback(
    (error: Error | { message?: string }, context: 'chat' | 'template' | 'llmcall' = 'chat') => {
      logger.error(`${context} request failed`, error);

      stop();
      setFakeLoading(false);

      let errorInfo = {
        message: 'An unexpected error occurred',
        isRetryable: true,
        statusCode: 500,
        provider: providerName,
        type: 'unknown' as const,
        retryDelay: 0,
      };

      if (error.message) {
        try {
          const parsed = JSON.parse(error.message);

          if (parsed.error || parsed.message) {
            errorInfo = { ...errorInfo, ...parsed };
          } else {
            errorInfo.message = error.message;
          }
        } catch {
          errorInfo.message = error.message;
        }
      }

      let errorType: LlmErrorAlertType['errorType'] = 'unknown';
      let title = 'Request Failed';

      if (errorInfo.statusCode === 401 || errorInfo.message.toLowerCase().includes('api key')) {
        errorType = 'authentication';
        title = 'Authentication Error';
      } else if (errorInfo.statusCode === 429 || errorInfo.message.toLowerCase().includes('rate limit')) {
        errorType = 'rate_limit';
        title = 'Rate Limit Exceeded';
      } else if (errorInfo.message.toLowerCase().includes('quota')) {
        errorType = 'quota';
        title = 'Quota Exceeded';
      } else if (errorInfo.statusCode >= 500) {
        errorType = 'network';
        title = 'Server Error';
      }

      logStore.logError(`${context} request failed`, error, {
        component: 'Chat',
        action: 'request',
        error: errorInfo.message,
        context,
        retryable: errorInfo.isRetryable,
        errorType,
        provider: providerName,
      });

      // Create API error alert
      setLlmErrorAlert({
        type: 'error',
        title,
        description: errorInfo.message,
        provider: providerName,
        errorType,
      });
      setData([]);
    },
    [providerName, stop, setFakeLoading, setData],
  );

  const clearLlmErrorAlert = useCallback(() => {
    setLlmErrorAlert(undefined);
  }, []);

  return { llmErrorAlert, clearLlmErrorAlert, handleError };
}
