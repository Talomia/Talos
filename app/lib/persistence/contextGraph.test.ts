import { describe, it, expect, vi } from 'vitest';
import {
  estimateTokens,
  estimateConversationTokens,
  computeFileDelta,
  hashFileContent,
  generateNodeId,
  reconstructFiles,
  findCommonAncestor,
  createNode,
  createBranch,
  advanceBranch,
  computeGraphStats,
} from './contextGraph';
import type { ContextNode, ContextBranch, NodeId } from './contextGraph';

// Suppress logger output during tests
vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

/*
 * ==========================================
 * Helpers
 * ==========================================
 */

/** Build a minimal ContextNode for graph tests. */
function makeNode(
  id: NodeId,
  parents: NodeId[],
  changedFiles: Array<{ path: string; content: string; contentHash: string }> = [],
  filePaths: string[] = [],
  overrides: Partial<ContextNode> = {},
): ContextNode {
  return {
    id,
    parents,
    chatId: 'test-chat',
    messageIndex: 0,
    messageCount: 1,
    changeSummary: '',
    changedFiles,
    filePaths: filePaths.length > 0 ? filePaths : changedFiles.map((f) => f.path),
    tokenEstimate: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/*
 * ==========================================
 * estimateTokens
 * ==========================================
 */

describe('estimateTokens', () => {
  it('returns 0-ish for an empty string', () => {
    const result = estimateTokens('');

    /*
     * Empty string: charCount=0, wordCount=1 (split on whitespace gives [''])
     * Both estimates are small; the important thing is it doesn't throw or return negative
     */
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('estimates tokens for short text', () => {
    const result = estimateTokens('Hello world');
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(20);
  });

  it('estimates tokens for longer text', () => {
    const longText = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
    const result = estimateTokens(longText);

    // ~4500 chars → ~1200 tokens
    expect(result).toBeGreaterThan(500);
    expect(result).toBeLessThan(5000);
  });

  it('estimates tokens for code', () => {
    const code = `function fibonacci(n: number): number {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}`;
    const result = estimateTokens(code);
    expect(result).toBeGreaterThan(10);
    expect(result).toBeLessThan(200);
  });
});

/*
 * ==========================================
 * estimateConversationTokens
 * ==========================================
 */

describe('estimateConversationTokens', () => {
  it('includes system prompt overhead', () => {
    const result = estimateConversationTokens([]);

    // Even with no messages, the 10-token framing overhead is added
    expect(result).toBe(10);
  });

  it('handles a single message', () => {
    const result = estimateConversationTokens([{ role: 'user', content: 'Hello world' }]);

    // 10 (overhead) + 4 (per-message) + estimateTokens('Hello world')
    expect(result).toBeGreaterThan(10);
  });

  it('scales with multiple messages', () => {
    const single = estimateConversationTokens([{ role: 'user', content: 'Hello' }]);
    const multi = estimateConversationTokens([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' },
    ]);
    expect(multi).toBeGreaterThan(single);
  });
});

/*
 * ==========================================
 * hashFileContent
 * ==========================================
 */

describe('hashFileContent', () => {
  it('returns a hex string', async () => {
    const hash = await hashFileContent('hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same content produces same hash', async () => {
    const a = await hashFileContent('identical content');
    const b = await hashFileContent('identical content');
    expect(a).toBe(b);
  });

  it('different content produces different hash', async () => {
    const a = await hashFileContent('content A');
    const b = await hashFileContent('content B');
    expect(a).not.toBe(b);
  });
});

/*
 * ==========================================
 * generateNodeId
 * ==========================================
 */

describe('generateNodeId', () => {
  it('returns a 64-char hex string', async () => {
    const id = await generateNodeId({
      parents: [],
      chatId: 'chat-1',
      messageIndex: 0,
      changeSummary: 'initial',
      changedFiles: [],
    });
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input yields same output', async () => {
    const input = {
      parents: ['abc'],
      chatId: 'chat-1',
      messageIndex: 5,
      changeSummary: 'added utils',
      changedFiles: [{ path: 'a.ts', content: 'x', contentHash: 'h1' }],
    };
    const id1 = await generateNodeId(input);
    const id2 = await generateNodeId(input);
    expect(id1).toBe(id2);
  });

  it('different inputs yield different IDs', async () => {
    const base = {
      parents: [],
      chatId: 'chat-1',
      messageIndex: 0,
      changeSummary: 'init',
      changedFiles: [],
    };
    const a = await generateNodeId(base);
    const b = await generateNodeId({ ...base, chatId: 'chat-2' });
    expect(a).not.toBe(b);
  });
});

/*
 * ==========================================
 * computeFileDelta
 * ==========================================
 */

describe('computeFileDelta', () => {
  it('returns empty array when nothing changed', async () => {
    const files = { 'a.ts': 'content' };
    const delta = await computeFileDelta(files, files);
    expect(delta).toHaveLength(0);
  });

  it('detects a new file', async () => {
    const current = { 'a.ts': 'hello' };
    const previous = {};
    const delta = await computeFileDelta(current, previous);
    expect(delta).toHaveLength(1);
    expect(delta[0].path).toBe('a.ts');
    expect(delta[0].content).toBe('hello');
    expect(delta[0].contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('detects a modified file', async () => {
    const current = { 'a.ts': 'updated' };
    const previous = { 'a.ts': 'original' };
    const delta = await computeFileDelta(current, previous);
    expect(delta).toHaveLength(1);
    expect(delta[0].content).toBe('updated');
  });

  it('detects multiple changes at once', async () => {
    const current = { 'a.ts': 'new-a', 'b.ts': 'new-b', 'c.ts': 'same' };
    const previous = { 'a.ts': 'old-a', 'c.ts': 'same' };
    const delta = await computeFileDelta(current, previous);
    expect(delta).toHaveLength(2);

    const paths = delta.map((d) => d.path).sort();
    expect(paths).toEqual(['a.ts', 'b.ts']);
  });
});

/*
 * ==========================================
 * reconstructFiles
 * ==========================================
 */

describe('reconstructFiles', () => {
  it('reconstructs a single root node', () => {
    const root = makeNode('root', [], [{ path: 'index.ts', content: 'v1', contentHash: 'h1' }], ['index.ts']);
    const files = reconstructFiles([root], 'root');
    expect(files).toEqual({ 'index.ts': 'v1' });
  });

  it('applies deltas along a chain of nodes', () => {
    const root = makeNode('root', [], [{ path: 'a.ts', content: 'v1', contentHash: 'h1' }], ['a.ts']);
    const child = makeNode('child', ['root'], [{ path: 'a.ts', content: 'v2', contentHash: 'h2' }], ['a.ts']);
    const files = reconstructFiles([root, child], 'child');
    expect(files).toEqual({ 'a.ts': 'v2' });
  });

  it('removes files that disappear in later nodes', () => {
    const root = makeNode(
      'root',
      [],
      [
        { path: 'a.ts', content: 'a', contentHash: 'ha' },
        { path: 'b.ts', content: 'b', contentHash: 'hb' },
      ],
      ['a.ts', 'b.ts'],
    );

    // Child keeps only a.ts
    const child = makeNode('child', ['root'], [], ['a.ts']);
    const files = reconstructFiles([root, child], 'child');
    expect(files).toEqual({ 'a.ts': 'a' });
    expect(files['b.ts']).toBeUndefined();
  });
});

/*
 * ==========================================
 * findCommonAncestor
 * ==========================================
 */

describe('findCommonAncestor', () => {
  it('returns the root for a linear chain', () => {
    // root → A → B
    const root = makeNode('root', []);
    const a = makeNode('a', ['root']);
    const b = makeNode('b', ['a']);
    const result = findCommonAncestor([root, a, b], 'a', 'b');
    expect(result).toBe('a');
  });

  it('finds common ancestor at a fork', () => {
    // root → A, root → B
    const root = makeNode('root', []);
    const a = makeNode('a', ['root']);
    const b = makeNode('b', ['root']);
    const result = findCommonAncestor([root, a, b], 'a', 'b');
    expect(result).toBe('root');
  });

  it('returns null when there is no common ancestor', () => {
    const a = makeNode('a', []);
    const b = makeNode('b', []);
    const result = findCommonAncestor([a, b], 'a', 'b');
    expect(result).toBeNull();
  });

  it('handles the same node as both arguments', () => {
    const root = makeNode('root', []);
    const result = findCommonAncestor([root], 'root', 'root');
    expect(result).toBe('root');
  });
});

/*
 * ==========================================
 * createBranch & advanceBranch
 * ==========================================
 */

describe('createBranch', () => {
  it('creates a branch with correct properties', () => {
    const branch = createBranch('feature/x', 'chat-1', 'node-abc');
    expect(branch.name).toBe('feature/x');
    expect(branch.chatId).toBe('chat-1');
    expect(branch.headNodeId).toBe('node-abc');
    expect(branch.isDefault).toBe(false);
    expect(branch.updatedAt).toBeTruthy();
  });
});

describe('advanceBranch', () => {
  it('advances the branch head while preserving other fields', () => {
    const branch = createBranch('main', 'chat-1', 'node-1');
    const advanced = advanceBranch(branch, 'node-2');
    expect(advanced.headNodeId).toBe('node-2');
    expect(advanced.name).toBe('main');
    expect(advanced.chatId).toBe('chat-1');
  });
});

/*
 * ==========================================
 * createNode
 * ==========================================
 */

describe('createNode', () => {
  it('creates a node with computed delta and ID', async () => {
    const node = await createNode({
      parents: [],
      chatId: 'chat-1',
      messageIndex: 0,
      messageCount: 1,
      changeSummary: 'initial commit',
      currentFiles: { 'index.ts': 'console.log("hi")' },
      previousFiles: {},
    });

    expect(node.id).toMatch(/^[0-9a-f]{64}$/);
    expect(node.parents).toEqual([]);
    expect(node.changedFiles).toHaveLength(1);
    expect(node.changedFiles[0].path).toBe('index.ts');
    expect(node.filePaths).toEqual(['index.ts']);
    expect(node.createdAt).toBeTruthy();
  });
});

/*
 * ==========================================
 * computeGraphStats
 * ==========================================
 */

describe('computeGraphStats', () => {
  it('returns zeroed stats for empty graph', () => {
    const stats = computeGraphStats([], []);
    expect(stats.nodeCount).toBe(0);
    expect(stats.branchCount).toBe(0);
    expect(stats.totalFilesTracked).toBe(0);
    expect(stats.estimatedTokens).toBe(0);
    expect(stats.oldestNodeDate).toBe('');
    expect(stats.newestNodeDate).toBe('');
  });

  it('computes correct stats for a non-empty graph', () => {
    const nodes: ContextNode[] = [
      makeNode('n1', [], [], ['a.ts', 'b.ts'], {
        tokenEstimate: 100,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      makeNode('n2', ['n1'], [], ['a.ts', 'c.ts'], {
        tokenEstimate: 250,
        createdAt: '2026-06-15T12:00:00.000Z',
      }),
    ];
    const branches: ContextBranch[] = [createBranch('main', 'chat-1', 'n2'), createBranch('exp', 'chat-1', 'n1')];

    const stats = computeGraphStats(nodes, branches);
    expect(stats.nodeCount).toBe(2);
    expect(stats.branchCount).toBe(2);
    expect(stats.totalFilesTracked).toBe(3); // a.ts, b.ts, c.ts
    expect(stats.estimatedTokens).toBe(250); // max
    expect(stats.oldestNodeDate).toBe('2026-01-01T00:00:00.000Z');
    expect(stats.newestNodeDate).toBe('2026-06-15T12:00:00.000Z');
  });
});
