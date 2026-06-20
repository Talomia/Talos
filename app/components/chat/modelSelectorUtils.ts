import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';

/*
 * ---------------------------------------------------------------------------
 * Shared types
 * ---------------------------------------------------------------------------
 */

export type ConnectionStatus = 'unknown' | 'connected' | 'disconnected';

/** A ModelInfo decorated with search-scoring metadata. */
export interface SearchableModel extends ModelInfo {
  searchScore: number;
  searchMatches: boolean;
  highlightedLabel: string;
  highlightedName: string;
}

/** A ProviderInfo decorated with search-scoring metadata. */
export interface SearchableProvider extends ProviderInfo {
  searchScore: number;
  searchMatches: boolean;
  highlightedName: string;
}

/*
 * ---------------------------------------------------------------------------
 * Shared constants
 * ---------------------------------------------------------------------------
 */

/** Scrollbar styling classes reused across both dropdown panels. */
export const SCROLLBAR_CLASSES = [
  'max-h-60 overflow-y-auto',
  'sm:scrollbar-none',
  '[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2',
  '[&::-webkit-scrollbar-thumb]:bg-ui-borderColor',
  '[&::-webkit-scrollbar-thumb]:hover:bg-ui-borderColorHover',
  '[&::-webkit-scrollbar-thumb]:rounded-full',
  '[&::-webkit-scrollbar-track]:bg-ui-background-depth-2',
  '[&::-webkit-scrollbar-track]:rounded-full',
  'sm:[&::-webkit-scrollbar]:w-1.5 sm:[&::-webkit-scrollbar]:h-1.5',
  'sm:hover:[&::-webkit-scrollbar-thumb]:bg-ui-borderColor/50',
  'sm:hover:[&::-webkit-scrollbar-thumb:hover]:bg-ui-borderColor',
  'sm:[&::-webkit-scrollbar-track]:bg-transparent',
] as const;

/*
 * ---------------------------------------------------------------------------
 * Filtering / sorting helpers
 * ---------------------------------------------------------------------------
 */

/**
 * Filters, scores and sorts models for the model dropdown.
 * Pure function – no React dependency.
 */
export const filterModels = (
  modelList: ModelInfo[],
  providerName: string | undefined,
  showFreeModelsOnly: boolean,
  searchQuery: string,
): SearchableModel[] => {
  const baseModels = [...modelList].filter((e) => e.provider === providerName && e.name);

  return baseModels
    .filter((m) => {
      // Apply free models filter
      if (showFreeModelsOnly && !isModelLikelyFree(m, providerName)) {
        return false;
      }

      return true;
    })
    .map((m) => {
      // Calculate search scores for fuzzy matching
      const labelMatch = fuzzyMatch(searchQuery, m.label);
      const nameMatch = fuzzyMatch(searchQuery, m.name);
      const contextMatch = fuzzyMatch(searchQuery, formatContextSize(m.maxTokenAllowed));

      const bestScore = Math.max(labelMatch.score, nameMatch.score, contextMatch.score);
      const matches = labelMatch.matches || nameMatch.matches || contextMatch.matches || !searchQuery; // Show all if no query

      return {
        ...m,
        searchScore: bestScore,
        searchMatches: matches,
        highlightedLabel: highlightText(m.label, searchQuery),
        highlightedName: highlightText(m.name, searchQuery),
      };
    })
    .filter((m) => m.searchMatches)
    .sort((a, b) => {
      // Sort by search score (highest first), then by label
      if (searchQuery) {
        return b.searchScore - a.searchScore;
      }

      return a.label.localeCompare(b.label);
    });
};

/**
 * Filters, scores and sorts providers for the provider dropdown.
 * Pure function – no React dependency.
 */
export const filterProviders = (providerList: ProviderInfo[], searchQuery: string): SearchableProvider[] => {
  if (!searchQuery) {
    return providerList.map((p) => ({
      ...p,
      searchScore: 0,
      searchMatches: true,
      highlightedName: p.name,
    }));
  }

  return providerList
    .map((p) => {
      const match = fuzzyMatch(searchQuery, p.name);
      return {
        ...p,
        searchScore: match.score,
        searchMatches: match.matches,
        highlightedName: highlightText(p.name, searchQuery),
      };
    })
    .filter((p) => p.searchMatches)
    .sort((a, b) => b.searchScore - a.searchScore);
};

/**
 * Levenshtein distance algorithm for fuzzy string matching.
 * Computes the minimum number of single-character edits (insertions,
 * deletions, or substitutions) required to change one word into the other.
 */
export const levenshteinDistance = (str1: string, str2: string): number => {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }

  return matrix[str2.length][str1.length];
};

/**
 * Fuzzy match a search query against text.
 * Returns a score (0-100) and whether it matches at all.
 * Exact substring matches score highest; fuzzy matches use Levenshtein distance.
 */
export const fuzzyMatch = (query: string, text: string): { score: number; matches: boolean } => {
  if (!query) {
    return { score: 0, matches: true };
  }

  if (!text) {
    return { score: 0, matches: false };
  }

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // Exact substring match gets highest score
  if (textLower.includes(queryLower)) {
    return { score: 100 - (textLower.indexOf(queryLower) / textLower.length) * 20, matches: true };
  }

  // Fuzzy match with reasonable threshold
  const distance = levenshteinDistance(queryLower, textLower);
  const maxLen = Math.max(queryLower.length, textLower.length);
  const similarity = 1 - distance / maxLen;

  return {
    score: similarity > 0.6 ? similarity * 80 : 0,
    matches: similarity > 0.6,
  };
};

/**
 * Highlights matching text by wrapping matches in <mark> tags.
 * Escapes regex special characters in the query to prevent injection.
 */
export const highlightText = (text: string, query: string): string => {
  if (!query) {
    return text;
  }

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');

  return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 text-current">$1</mark>');
};

/**
 * Formats a context window size (in tokens) to a human-readable string.
 * e.g. 128000 → "128K", 1000000 → "1.0M"
 */
export const formatContextSize = (tokens: number): string => {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }

  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`;
  }

  return tokens.toString();
};

/**
 * Determines if a model is likely free based on its pricing metadata or name.
 */
export const isModelLikelyFree = (model: ModelInfo, providerName?: string): boolean => {
  // OpenRouter models with zero pricing in the label
  if (providerName === 'OpenRouter' && model.label.includes('in:$0.00') && model.label.includes('out:$0.00')) {
    return true;
  }

  // Models with "free" in the name or label
  if (model.name.toLowerCase().includes('free') || model.label.toLowerCase().includes('free')) {
    return true;
  }

  return false;
};
