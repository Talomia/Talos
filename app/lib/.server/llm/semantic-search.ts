/**
 * Semantic Search — Vector-Based File Retrieval
 * ===============================================
 * Provides embedding-based semantic search for finding relevant
 * code files. Uses a lightweight in-memory vector store with
 * TF-IDF-like scoring for fast, dependency-free semantic matching.
 *
 * This supplements the LLM-based context selection with a fast,
 * deterministic first-pass filter that narrows the candidate set
 * before the LLM makes final decisions.
 */

import { createScopedLogger } from '~/utils/logger';
import type { FileMap } from './constants';

const logger = createScopedLogger('semantic-search');

interface FileVector {
  path: string;
  tokens: Map<string, number>; // token -> TF-IDF weight
  magnitude: number;

  /** File type for priority scoring */
  fileType: 'config' | 'entry' | 'component' | 'utility' | 'style' | 'test' | 'other';
}

interface SearchResult {
  path: string;
  score: number;
  fileType: FileVector['fileType'];
}

/**
 * File type priority weights — config and entry files get a boost.
 */
const FILE_TYPE_BOOST: Record<FileVector['fileType'], number> = {
  config: 1.5,
  entry: 1.3,
  component: 1.1,
  utility: 1.0,
  style: 0.8,
  test: 0.5,
  other: 0.7,
};

/**
 * Classify a file path into a file type for priority scoring.
 */
function classifyFileType(path: string): FileVector['fileType'] {
  const lower = path.toLowerCase();

  // Config files
  if (
    lower.includes('config') ||
    lower.includes('tsconfig') ||
    lower.endsWith('package.json') ||
    lower.endsWith('.env') ||
    lower.endsWith('.eslintrc') ||
    lower.includes('tailwind') ||
    lower.includes('postcss') ||
    lower.includes('vite.config') ||
    lower.includes('next.config') ||
    lower.includes('webpack.config')
  ) {
    return 'config';
  }

  // Entry points
  if (
    lower.endsWith('index.ts') ||
    lower.endsWith('index.tsx') ||
    lower.endsWith('index.js') ||
    lower.endsWith('main.ts') ||
    lower.endsWith('main.tsx') ||
    lower.endsWith('app.tsx') ||
    lower.endsWith('app.ts') ||
    lower.includes('layout.tsx') ||
    lower.includes('_app.tsx')
  ) {
    return 'entry';
  }

  // Test files
  if (lower.includes('.test.') || lower.includes('.spec.') || lower.includes('__tests__')) {
    return 'test';
  }

  // Style files
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.less') || lower.endsWith('.sass')) {
    return 'style';
  }

  // Component files
  if (lower.endsWith('.tsx') || lower.endsWith('.jsx') || lower.includes('component')) {
    return 'component';
  }

  // Utility files
  if (
    lower.includes('util') ||
    lower.includes('helper') ||
    lower.includes('hook') ||
    lower.includes('lib/') ||
    lower.includes('types')
  ) {
    return 'utility';
  }

  return 'other';
}

/**
 * Tokenize source code into meaningful terms for TF-IDF.
 * Splits on camelCase, snake_case, paths, and symbols.
 */
function tokenize(text: string): string[] {
  // Split camelCase and PascalCase
  const expanded = text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

  // Split on non-alphanumeric, lowercase, filter short tokens
  return expanded
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && t.length <= 30)
    .filter((t) => !STOP_WORDS.has(t));
}

/**
 * Common programming stop words that don't carry semantic meaning.
 */
const STOP_WORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'new',
  'this',
  'class',
  'extends',
  'import',
  'export',
  'from',
  'default',
  'typeof',
  'instanceof',
  'void',
  'null',
  'undefined',
  'true',
  'false',
  'async',
  'await',
  'try',
  'catch',
  'throw',
  'finally',
  'type',
  'interface',
  'enum',
  'as',
  'in',
  'of',
  'is',
]);

/**
 * In-memory vector store for semantic file search.
 * Uses TF-IDF weighting for fast, dependency-free similarity matching.
 */
export class SemanticFileIndex {
  #vectors: FileVector[] = [];
  #documentFrequency: Map<string, number> = new Map();
  #totalDocuments = 0;

  /**
   * Index all files in the project for semantic search.
   */
  indexFiles(files: FileMap) {
    this.#vectors = [];
    this.#documentFrequency = new Map();

    // First pass: compute document frequency
    const allTermFreqs: Map<string, Map<string, number>>[] = [];

    for (const [path, entry] of Object.entries(files)) {
      if (!entry || entry.type !== 'file' || !entry.content) {
        continue;
      }

      // Include path tokens for better matching
      const pathTokens = tokenize(path);
      const contentTokens = tokenize(entry.content);
      const allTokens = [...pathTokens, ...pathTokens, ...contentTokens]; // double-weight path tokens

      const termFreq = new Map<string, number>();

      for (const token of allTokens) {
        termFreq.set(token, (termFreq.get(token) || 0) + 1);
      }

      allTermFreqs.push(new Map([[path, termFreq]]));

      // Update document frequency
      for (const token of termFreq.keys()) {
        this.#documentFrequency.set(token, (this.#documentFrequency.get(token) || 0) + 1);
      }
    }

    this.#totalDocuments = allTermFreqs.length;

    // Second pass: compute TF-IDF vectors
    for (const docMap of allTermFreqs) {
      for (const [path, termFreq] of docMap) {
        const tfidf = new Map<string, number>();
        let magnitude = 0;

        const maxTf = Math.max(...termFreq.values());

        for (const [token, freq] of termFreq) {
          const tf = 0.5 + (0.5 * freq) / maxTf; // augmented frequency
          const df = this.#documentFrequency.get(token) || 1;
          const idf = Math.log(this.#totalDocuments / df);
          const weight = tf * idf;
          tfidf.set(token, weight);
          magnitude += weight * weight;
        }

        magnitude = Math.sqrt(magnitude);

        this.#vectors.push({
          path,
          tokens: tfidf,
          magnitude,
          fileType: classifyFileType(path),
        });
      }
    }

    logger.info(`Semantic index built: ${this.#vectors.length} files, ${this.#documentFrequency.size} unique terms`);
  }

  /**
   * Search for files most relevant to a query string.
   * Returns top-K results sorted by relevance score.
   */
  search(query: string, topK: number = 20): SearchResult[] {
    if (this.#vectors.length === 0) {
      return [];
    }

    const queryTokens = tokenize(query);
    const queryFreq = new Map<string, number>();

    for (const token of queryTokens) {
      queryFreq.set(token, (queryFreq.get(token) || 0) + 1);
    }

    // Compute query TF-IDF vector
    const queryVec = new Map<string, number>();
    let queryMag = 0;
    const maxQf = Math.max(...queryFreq.values(), 1);

    for (const [token, freq] of queryFreq) {
      const tf = 0.5 + (0.5 * freq) / maxQf;
      const df = this.#documentFrequency.get(token) || 1;
      const idf = Math.log(this.#totalDocuments / df);
      const weight = tf * idf;
      queryVec.set(token, weight);
      queryMag += weight * weight;
    }

    queryMag = Math.sqrt(queryMag);

    if (queryMag === 0) {
      return [];
    }

    // Compute cosine similarity with file type boost
    const results: SearchResult[] = [];

    for (const fileVec of this.#vectors) {
      let dotProduct = 0;

      for (const [token, weight] of queryVec) {
        const docWeight = fileVec.tokens.get(token);

        if (docWeight) {
          dotProduct += weight * docWeight;
        }
      }

      if (dotProduct > 0 && fileVec.magnitude > 0) {
        const cosineSim = dotProduct / (queryMag * fileVec.magnitude);
        const boostedScore = cosineSim * FILE_TYPE_BOOST[fileVec.fileType];

        results.push({
          path: fileVec.path,
          score: boostedScore,
          fileType: fileVec.fileType,
        });
      }
    }

    // Sort by score descending and return top-K
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }

  /**
   * Get the number of indexed files.
   */
  get size(): number {
    return this.#vectors.length;
  }
}
