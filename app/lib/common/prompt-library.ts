import { getSystemPrompt } from './prompts/prompts';
import optimized from './prompts/optimized';
import { getFineTunedPrompt } from './prompts/new-prompt';
import type { DesignScheme } from '~/types/design-scheme';

export interface PromptOptions {
  cwd: string;
  allowedHtmlElements: string[];
  modificationTagName: string;
  designScheme?: DesignScheme;
  supabase?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
    credentials?: {
      anonKey?: string;
      supabaseUrl?: string;
    };
  };
}

export class PromptLibrary {
  static library: Record<
    string,
    {
      label: string;
      description: string;
      get: (options: PromptOptions) => string;
    }
  > = {
    default: {
      label: 'Default (Recommended)',
      description: 'Production-grade prompt with planning, code quality standards, and optimized token usage',
      get: (options) => getFineTunedPrompt(options.cwd, options.supabase, options.designScheme),
    },
    original: {
      label: 'Classic',
      description: 'The original system prompt — comprehensive with full HTML element list',
      get: (options) => getSystemPrompt(options.cwd, options.supabase, options.designScheme),
    },
    optimized: {
      label: 'Token-Optimized',
      description: 'Compact prompt variant for lower token usage with faster response times',
      get: (options) => optimized(options),
    },
  };
  static getList() {
    return Object.entries(this.library).map(([key, value]) => {
      const { label, description } = value;
      return {
        id: key,
        label,
        description,
      };
    });
  }
  static getPromptFromLibrary(promptId: string, options: PromptOptions) {
    const prompt = this.library[promptId];

    if (!prompt) {
      throw new Error('Prompt Not Found');
    }

    return this.library[promptId]?.get(options);
  }
}
