/**
 * ContextGraph — Git-like AI Context Versioning
 * ===============================================
 * A DAG-based system for versioning AI conversation context.
 * Each node represents a point-in-time snapshot of the conversation
 * (messages, files, metadata). Nodes are content-addressed and
 * form a directed acyclic graph with branching and merging.
 *
 * Key concepts:
 * - ContextNode: Immutable snapshot of conversation state
 * - Branch: Named pointer to a ContextNode (like a Git ref)
 * - HEAD: The currently active branch
 * - Checkout: Restore conversation to a specific node's state
 * - Compress: Summarize old context to fit within token limits
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('context-graph');

/*
 * ==========================================
 * Types
 * ==========================================
 */

/** Unique identifier for a context node (SHA-256 hash of content). */
export type NodeId = string;

/** Represents a file in the workspace at a point in time. */
export interface FileSnapshot {
  path: string;
  content: string;

  /** SHA-256 hash of file content for deduplication. */
  contentHash: string;
}

/**
 * A single node in the context graph.
 * Immutable once created — identified by content hash.
 */
export interface ContextNode {
  /** Content-addressed ID (SHA-256 of serialized content). */
  id: NodeId;

  /** Parent node IDs. Empty for root, multiple for merge commits. */
  parents: NodeId[];

  /** Chat ID this node belongs to. */
  chatId: string;

  /** Message index at the time of this snapshot. */
  messageIndex: number;

  /** Number of messages at this point. */
  messageCount: number;

  /** Summary of what changed since parent (for context compression). */
  changeSummary: string;

  /** File snapshots — only files that changed since parent (delta). */
  changedFiles: FileSnapshot[];

  /** All file paths at this point (for reconstruction). */
  filePaths: string[];

  /** Estimated token count for the conversation at this point. */
  tokenEstimate: number;

  /** ISO timestamp of creation. */
  createdAt: string;

  /** Optional metadata. */
  metadata?: Record<string, unknown>;
}

/** A named reference to a context node (like a Git branch). */
export interface ContextBranch {
  /** Branch name (e.g., 'main', 'experiment/ui-v2'). */
  name: string;

  /** The node this branch points to. */
  headNodeId: NodeId;

  /** Chat ID this branch is associated with. */
  chatId: string;

  /** Whether this is the default branch. */
  isDefault: boolean;

  /** ISO timestamp of last update. */
  updatedAt: string;
}

/** The HEAD pointer — which branch is currently active. */
export interface HeadPointer {
  /** Chat ID. */
  chatId: string;

  /** Currently active branch name. */
  branchName: string;

  /** Direct node reference (for detached HEAD state). */
  nodeId?: NodeId;

  /** Whether HEAD is detached (not pointing to a branch tip). */
  isDetached: boolean;
}

/** Merge strategy for combining branches. */
export type MergeStrategy = 'ours' | 'theirs' | 'newer-wins';

/** Result of a merge operation. */
export interface MergeResult {
  success: boolean;
  mergedNodeId?: NodeId;
  conflicts?: MergeConflict[];
}

/** A conflict during merge. */
export interface MergeConflict {
  filePath: string;
  oursContent: string;
  theirsContent: string;
  resolution?: 'ours' | 'theirs';
}

/** Statistics about the context graph. */
export interface GraphStats {
  nodeCount: number;
  branchCount: number;
  totalFilesTracked: number;
  estimatedTokens: number;
  oldestNodeDate: string;
  newestNodeDate: string;
}

/*
 * ==========================================
 * Content Addressing
 * ==========================================
 */

/**
 * Generate a content-addressed ID for a context node.
 * Uses SHA-256 hash of the serialized content.
 */
export async function generateNodeId(content: {
  parents: NodeId[];
  chatId: string;
  messageIndex: number;
  changeSummary: string;
  changedFiles: FileSnapshot[];
}): Promise<NodeId> {
  const serialized = JSON.stringify({
    parents: content.parents,
    chatId: content.chatId,
    messageIndex: content.messageIndex,
    changeSummary: content.changeSummary,
    fileHashes: content.changedFiles.map((f) => f.contentHash),
  });

  const buffer = new TextEncoder().encode(serialized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a SHA-256 hash for file content (for deduplication).
 */
export async function hashFileContent(content: string): Promise<string> {
  const buffer = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/*
 * ==========================================
 * Token Estimation
 * ==========================================
 */

/**
 * Estimate token count for a string.
 * Uses a simple heuristic: ~4 characters per token for English text.
 * This is intentionally conservative — real tokenizers are model-specific.
 */
export function estimateTokens(text: string): number {
  /*
   * Common heuristic: 1 token ≈ 4 characters for English
   * For code: 1 token ≈ 3.5 characters (more special chars)
   */
  const charCount = text.length;
  const wordCount = text.split(/\s+/).length;

  // Blend character-based and word-based estimates
  const charEstimate = Math.ceil(charCount / 3.8);
  const wordEstimate = Math.ceil(wordCount * 1.3);

  return Math.max(charEstimate, wordEstimate);
}

/**
 * Estimate total tokens for a conversation's messages.
 */
export function estimateConversationTokens(messages: Array<{ role: string; content: string }>): number {
  let total = 0;

  for (const msg of messages) {
    // Each message has overhead: role, formatting tokens
    total += 4; // role + formatting overhead
    total += estimateTokens(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));
  }

  // System prompt and conversation framing overhead
  total += 10;

  return total;
}

/*
 * ==========================================
 * Delta Computation
 * ==========================================
 */

/**
 * Compute changed files between two file snapshots.
 * Only returns files that are new or modified (not unchanged).
 */
export async function computeFileDelta(
  currentFiles: Record<string, string>,
  previousFiles: Record<string, string>,
): Promise<FileSnapshot[]> {
  const changed: FileSnapshot[] = [];

  for (const [path, content] of Object.entries(currentFiles)) {
    const previousContent = previousFiles[path];

    if (previousContent === undefined || previousContent !== content) {
      const contentHash = await hashFileContent(content);
      changed.push({ path, content, contentHash });
    }
  }

  return changed;
}

/**
 * Reconstruct the full file tree at a given node by walking up the parent chain.
 * Each node stores only its delta — we accumulate changes from root to node.
 */
export function reconstructFiles(nodes: ContextNode[], targetNodeId: NodeId): Record<string, string> {
  const nodeMap = new Map<NodeId, ContextNode>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Walk from target to root, collecting the ancestor chain
  const chain: ContextNode[] = [];
  let current: ContextNode | undefined = nodeMap.get(targetNodeId);

  while (current) {
    chain.unshift(current); // prepend so root is first
    current = current.parents.length > 0 ? nodeMap.get(current.parents[0]) : undefined;
  }

  // Apply deltas in order (root → target)
  const files: Record<string, string> = {};

  for (const node of chain) {
    for (const file of node.changedFiles) {
      files[file.path] = file.content;
    }

    // Remove files that no longer exist at this point
    for (const existingPath of Object.keys(files)) {
      if (!node.filePaths.includes(existingPath)) {
        delete files[existingPath];
      }
    }
  }

  return files;
}

/*
 * ==========================================
 * Graph Operations
 * ==========================================
 */

/**
 * Create a new context node from the current conversation state.
 */
export async function createNode(params: {
  parents: NodeId[];
  chatId: string;
  messageIndex: number;
  messageCount: number;
  changeSummary: string;
  currentFiles: Record<string, string>;
  previousFiles: Record<string, string>;
  tokenEstimate?: number;
  metadata?: Record<string, unknown>;
}): Promise<ContextNode> {
  const changedFiles = await computeFileDelta(params.currentFiles, params.previousFiles);
  const filePaths = Object.keys(params.currentFiles);

  const nodeId = await generateNodeId({
    parents: params.parents,
    chatId: params.chatId,
    messageIndex: params.messageIndex,
    changeSummary: params.changeSummary,
    changedFiles,
  });

  const node: ContextNode = {
    id: nodeId,
    parents: params.parents,
    chatId: params.chatId,
    messageIndex: params.messageIndex,
    messageCount: params.messageCount,
    changeSummary: params.changeSummary,
    changedFiles,
    filePaths,
    tokenEstimate: params.tokenEstimate ?? 0,
    createdAt: new Date().toISOString(),
    metadata: params.metadata,
  };

  logger.debug(`Created context node ${nodeId.slice(0, 8)}... (${changedFiles.length} changed files)`);

  return node;
}

/**
 * Create a new branch pointing to a specific node.
 */
export function createBranch(name: string, chatId: string, headNodeId: NodeId): ContextBranch {
  return {
    name,
    headNodeId,
    chatId,
    isDefault: false,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Advance a branch to point to a new node.
 */
export function advanceBranch(branch: ContextBranch, newNodeId: NodeId): ContextBranch {
  return {
    ...branch,
    headNodeId: newNodeId,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Find the common ancestor of two nodes (for merge operations).
 */
export function findCommonAncestor(nodes: ContextNode[], nodeIdA: NodeId, nodeIdB: NodeId): NodeId | null {
  const nodeMap = new Map<NodeId, ContextNode>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Collect all ancestors of node A
  const ancestorsA = new Set<NodeId>();
  const queueA: NodeId[] = [nodeIdA];

  while (queueA.length > 0) {
    const id = queueA.shift()!;

    if (ancestorsA.has(id)) {
      continue;
    }

    ancestorsA.add(id);

    const node = nodeMap.get(id);

    if (node) {
      queueA.push(...node.parents);
    }
  }

  // BFS from node B — first ancestor found in A's ancestors is the common ancestor
  const queueB: NodeId[] = [nodeIdB];
  const visitedB = new Set<NodeId>();

  while (queueB.length > 0) {
    const id = queueB.shift()!;

    if (visitedB.has(id)) {
      continue;
    }

    visitedB.add(id);

    if (ancestorsA.has(id)) {
      return id;
    }

    const node = nodeMap.get(id);

    if (node) {
      queueB.push(...node.parents);
    }
  }

  return null;
}

/**
 * Merge two branches using a specified strategy.
 * Creates a new merge node with two parents.
 */
export async function mergeBranches(
  nodes: ContextNode[],
  oursNodeId: NodeId,
  theirsNodeId: NodeId,
  chatId: string,
  strategy: MergeStrategy = 'newer-wins',
): Promise<MergeResult> {
  const nodeMap = new Map<NodeId, ContextNode>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const oursNode = nodeMap.get(oursNodeId);
  const theirsNode = nodeMap.get(theirsNodeId);

  if (!oursNode || !theirsNode) {
    return { success: false, conflicts: [] };
  }

  // Find common ancestor
  const commonAncestorId = findCommonAncestor(nodes, oursNodeId, theirsNodeId);

  // Reconstruct file trees
  const oursFiles = reconstructFiles(nodes, oursNodeId);
  const theirsFiles = reconstructFiles(nodes, theirsNodeId);
  const baseFiles = commonAncestorId ? reconstructFiles(nodes, commonAncestorId) : {};

  // Three-way merge
  const mergedFiles: Record<string, string> = { ...oursFiles };
  const conflicts: MergeConflict[] = [];

  // Add/update files from theirs
  for (const [path, theirsContent] of Object.entries(theirsFiles)) {
    const oursContent = oursFiles[path];
    const baseContent = baseFiles[path];

    if (oursContent === undefined) {
      // File only in theirs — add it
      mergedFiles[path] = theirsContent;
    } else if (oursContent === theirsContent) {
      // Same content — no conflict
      continue;
    } else if (oursContent === baseContent) {
      // We didn't change it, they did — take theirs
      mergedFiles[path] = theirsContent;
    } else if (theirsContent === baseContent) {
      // They didn't change it, we did — keep ours
      continue;
    } else {
      // Both modified — conflict
      switch (strategy) {
        case 'ours':
          // Keep ours (already in mergedFiles)
          break;
        case 'theirs':
          mergedFiles[path] = theirsContent;
          break;
        case 'newer-wins': {
          const oursDate = new Date(oursNode.createdAt).getTime();
          const theirsDate = new Date(theirsNode.createdAt).getTime();
          mergedFiles[path] = theirsDate > oursDate ? theirsContent : oursContent;
          break;
        }
      }

      conflicts.push({
        filePath: path,
        oursContent,
        theirsContent,
        resolution: strategy === 'theirs' ? 'theirs' : 'ours',
      });
    }
  }

  // Create merge node
  const mergeNode = await createNode({
    parents: [oursNodeId, theirsNodeId],
    chatId,
    messageIndex: Math.max(oursNode.messageIndex, theirsNode.messageIndex),
    messageCount: Math.max(oursNode.messageCount, theirsNode.messageCount),
    changeSummary: `Merge: ${conflicts.length} conflict(s) resolved with '${strategy}' strategy`,
    currentFiles: mergedFiles,
    previousFiles: oursFiles,
  });

  logger.info(
    `Merged nodes ${oursNodeId.slice(0, 8)} + ${theirsNodeId.slice(0, 8)} → ${mergeNode.id.slice(0, 8)} ` +
      `(${conflicts.length} conflicts)`,
  );

  return {
    success: true,
    mergedNodeId: mergeNode.id,
    conflicts: conflicts.length > 0 ? conflicts : undefined,
  };
}

/**
 * Compute graph statistics.
 */
export function computeGraphStats(nodes: ContextNode[], branches: ContextBranch[]): GraphStats {
  const allFiles = new Set<string>();
  let oldestDate = '';
  let newestDate = '';
  let maxTokens = 0;

  for (const node of nodes) {
    for (const path of node.filePaths) {
      allFiles.add(path);
    }

    if (!oldestDate || node.createdAt < oldestDate) {
      oldestDate = node.createdAt;
    }

    if (!newestDate || node.createdAt > newestDate) {
      newestDate = node.createdAt;
    }

    if (node.tokenEstimate > maxTokens) {
      maxTokens = node.tokenEstimate;
    }
  }

  return {
    nodeCount: nodes.length,
    branchCount: branches.length,
    totalFilesTracked: allFiles.size,
    estimatedTokens: maxTokens,
    oldestNodeDate: oldestDate,
    newestNodeDate: newestDate,
  };
}
