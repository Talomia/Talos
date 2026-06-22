import { useEffect, useRef, useState } from 'react';
import type { ProviderInfo } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('usePromptEnhancement');

export function usePromptEnhancer() {
  const [enhancingPrompt, setEnhancingPrompt] = useState(false);
  const [promptEnhanced, setPromptEnhanced] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort any in-flight enhancer request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const resetEnhancer = () => {
    setEnhancingPrompt(false);
    setPromptEnhanced(false);
  };

  const enhancePrompt = async (
    input: string,
    setInput: (value: string) => void,
    model: string,
    provider: ProviderInfo,
  ) => {
    setEnhancingPrompt(true);
    setPromptEnhanced(false);

    const requestBody = {
      message: input,
      model,
      provider,
    };

    // Abort any previous in-flight request
    abortControllerRef.current?.abort();

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const response = await fetch('/api/enhancer', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      signal: abortController.signal,
    });

    if (!response.ok) {
      setEnhancingPrompt(false);
      logger.error(`Enhancer API failed: ${response.status} ${response.statusText}`);
      return;
    }

    const reader = response.body?.getReader();

    const originalInput = input;

    if (reader) {
      const decoder = new TextDecoder();

      let _input = '';
      let _error;

      try {
        setInput('');

        while (true) {
          if (abortController.signal.aborted) {
            await reader.cancel();
            break;
          }

          const { value, done } = await reader.read();

          if (done) {
            break;
          }

          _input += decoder.decode(value, { stream: true });

          logger.trace('Set input', _input);

          setInput(_input);
        }
      } catch (error) {
        if ((error as DOMException)?.name === 'AbortError') {
          await reader.cancel().catch(() => {});
          return;
        }

        _error = error;
        setInput(originalInput);
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }

        if (_error) {
          logger.error(_error);
        }

        setEnhancingPrompt(false);
        setPromptEnhanced(!_error);

        if (!_error) {
          setTimeout(() => {
            setInput(_input);
          });
        }
      }
    }
  };

  return { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer };
}
