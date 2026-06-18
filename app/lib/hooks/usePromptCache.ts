import { useCallback } from 'react';
import { setSecureCookie } from '~/lib/api/secureCookies';
import { debounce } from '~/utils/debounce';
import { PROMPT_COOKIE_KEY } from '~/utils/constants';

export interface UsePromptCacheReturn {
  debouncedCachePrompt: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

/**
 * Debounced function to cache the prompt in cookies.
 * Caches the trimmed value of the textarea input after a delay to optimize performance.
 */
export function usePromptCache(): UsePromptCacheReturn {
  const debouncedCachePrompt = useCallback(
    debounce((event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const trimmedValue = event.target.value.trim();
      setSecureCookie(PROMPT_COOKIE_KEY, trimmedValue, { expires: 30 });
    }, 1000),
    [],
  );

  return { debouncedCachePrompt };
}
