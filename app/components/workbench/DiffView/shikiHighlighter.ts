import { getHighlighter, type Highlighter } from 'shiki';

// Create and manage a single highlighter instance at the module level
let highlighterInstance: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

export const getSharedHighlighter = async (): Promise<Highlighter> => {
  if (highlighterInstance) {
    return highlighterInstance;
  }

  if (highlighterPromise) {
    return highlighterPromise;
  }

  highlighterPromise = getHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: [
      'typescript',
      'javascript',
      'json',
      'html',
      'css',
      'jsx',
      'tsx',
      'python',
      'php',
      'java',
      'c',
      'cpp',
      'csharp',
      'go',
      'ruby',
      'rust',
      'plaintext',
    ],
  });

  highlighterInstance = await highlighterPromise;
  highlighterPromise = null;

  // Clear the promise once resolved
  return highlighterInstance;
};
