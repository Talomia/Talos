/**
 * Cortex Store — Client-side State for ContextGraph
 * ===================================================
 * Nanostore atoms and computed values for the ContextGraph UI.
 * Provides reactive state management for branch navigation,
 * checkout operations, and graph visualization.
 */

import { atom, computed, map } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import type {
  ContextNode,
  ContextBranch,
  HeadPointer,
  NodeId,
  MergeStrategy,
  MergeResult,
} from '~/lib/persistence/contextGraph';
import {
  createNode,
  createBranch as createBranchRef,
  advanceBranch,
  mergeBranches,
  computeGraphStats,
  reconstructFiles,
  estimateConversationTokens,
} from '~/lib/persistence/contextGraph';
import {
  openContextGraphDB,
  saveNode,
  getNodesByChatId,
  saveBranchRef,
  getBranchesByChatId,
  getBranch,
  deleteBranchRef,
  saveHead,
  getHead,
  deleteGraphForChat,
} from '~/lib/persistence/contextGraphStore';

const logger = createScopedLogger('cortex-store');

/*
 * ==========================================
 * Reactive State
 * ==========================================
 */

/** Whether the ContextGraph is initialized for the current chat. */
export const cortexInitialized = atom<boolean>(false);

/** The current chat ID the cortex is tracking. */
export const cortexChatId = atom<string | null>(null);

/** All context nodes for the current chat. */
export const cortexNodes = atom<ContextNode[]>([]);

/** All branches for the current chat. */
export const cortexBranches = atom<ContextBranch[]>([]);

/** The HEAD pointer for the current chat. */
export const cortexHead = atom<HeadPointer | null>(null);

/** Whether a cortex operation is in progress. */
export const cortexLoading = atom<boolean>(false);

/** Last error from a cortex operation. */
export const cortexError = atom<string | null>(null);

/** UI panel state. */
export const cortexPanelOpen = atom<boolean>(false);

/** Active tab in the cortex panel. */
export const cortexActiveTab = atom<'branches' | 'history' | 'stats'>('branches');

/*
 * ==========================================
 * Computed Values
 * ==========================================
 */

/** The currently active branch. */
export const activeBranch = computed(
  [cortexBranches, cortexHead],
  (branches: ContextBranch[], head: HeadPointer | null) => {
    if (!head || head.isDetached) {
      return null;
    }

    return branches.find((b: ContextBranch) => b.name === head.branchName) ?? null;
  },
);

/** The current HEAD node. */
export const headNode = computed(
  [cortexNodes, cortexHead, cortexBranches],
  (nodes: ContextNode[], head: HeadPointer | null, branches: ContextBranch[]) => {
    if (!head) {
      return null;
    }

    if (head.isDetached && head.nodeId) {
      return nodes.find((n: ContextNode) => n.id === head.nodeId) ?? null;
    }

    const branch = branches.find((b: ContextBranch) => b.name === head.branchName);

    if (!branch) {
      return null;
    }

    return nodes.find((n: ContextNode) => n.id === branch.headNodeId) ?? null;
  },
);

/** Graph statistics. */
export const graphStats = computed([cortexNodes, cortexBranches], (nodes, branches) => {
  if (nodes.length === 0) {
    return null;
  }

  return computeGraphStats(nodes, branches);
});

/** Whether the current chat has any context history. */
export const hasContextHistory = computed(cortexNodes, (nodes) => nodes.length > 0);

/** Dirty state — are there uncommitted changes? */
export const cortexDirty = map<{ files: boolean; messages: boolean }>({
  files: false,
  messages: false,
});

/*
 * ==========================================
 * Database Reference
 * ==========================================
 */

let _db: IDBDatabase | undefined;

async function getDB(): Promise<IDBDatabase | undefined> {
  if (!_db) {
    _db = await openContextGraphDB();
  }

  return _db;
}

/*
 * ==========================================
 * Core Operations
 * ==========================================
 */

/**
 * Initialize the cortex for a chat.
 * Loads existing nodes, branches, and HEAD from IndexedDB.
 */
export async function initCortex(chatId: string): Promise<void> {
  const db = await getDB();

  if (!db) {
    logger.warn('ContextGraph database unavailable');
    return;
  }

  cortexLoading.set(true);
  cortexError.set(null);

  try {
    cortexChatId.set(chatId);

    const [nodes, branches, head] = await Promise.all([
      getNodesByChatId(db, chatId),
      getBranchesByChatId(db, chatId),
      getHead(db, chatId),
    ]);

    cortexNodes.set(nodes);
    cortexBranches.set(branches);
    cortexHead.set(head ?? null);
    cortexInitialized.set(true);

    logger.info(`Cortex initialized for chat ${chatId} (${nodes.length} nodes, ${branches.length} branches)`);
  } catch (error) {
    logger.error('Failed to initialize cortex:', error);
    cortexError.set('Failed to load context history');
  } finally {
    cortexLoading.set(false);
  }
}

/**
 * Commit the current conversation state as a new context node.
 * This is the equivalent of `git commit`.
 */
export async function commitContext(params: {
  messages: Array<{ role: string; content: string }>;
  files: Record<string, string>;
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<NodeId | null> {
  const db = await getDB();
  const chatId = cortexChatId.get();

  if (!db || !chatId) {
    return null;
  }

  cortexLoading.set(true);
  cortexError.set(null);

  try {
    const currentNodes = cortexNodes.get();
    const head = cortexHead.get();
    const branches = cortexBranches.get();

    // Determine parent node
    let parentNodeId: NodeId | undefined;
    let previousFiles: Record<string, string> = {};

    if (head && !head.isDetached) {
      const branch = branches.find((b) => b.name === head.branchName);

      if (branch) {
        parentNodeId = branch.headNodeId;
        previousFiles = reconstructFiles(currentNodes, parentNodeId);
      }
    } else if (head?.nodeId) {
      parentNodeId = head.nodeId;
      previousFiles = reconstructFiles(currentNodes, parentNodeId);
    }

    // Create new node
    const tokenEstimate = estimateConversationTokens(params.messages);
    const node = await createNode({
      parents: parentNodeId ? [parentNodeId] : [],
      chatId,
      messageIndex: params.messages.length - 1,
      messageCount: params.messages.length,
      changeSummary: params.summary,
      currentFiles: params.files,
      previousFiles,
      tokenEstimate,
      metadata: params.metadata,
    });

    // Save node to IDB
    await saveNode(db, node);

    // Update branch to point to new node
    if (head && !head.isDetached) {
      const branch = branches.find((b) => b.name === head.branchName);

      if (branch) {
        const updated = advanceBranch(branch, node.id);
        await saveBranchRef(db, updated);
        cortexBranches.set(branches.map((b) => (b.name === updated.name ? updated : b)));
      }
    } else {
      // Create default branch if none exists
      const defaultBranch = createBranchRef('main', chatId, node.id);
      defaultBranch.isDefault = true;
      await saveBranchRef(db, defaultBranch);

      const newHead: HeadPointer = {
        chatId,
        branchName: 'main',
        isDetached: false,
      };
      await saveHead(db, newHead);
      cortexHead.set(newHead);
      cortexBranches.set([...branches, defaultBranch]);
    }

    // Update nodes list
    cortexNodes.set([...currentNodes, node]);
    cortexDirty.set({ files: false, messages: false });

    logger.info(`Committed context node ${node.id.slice(0, 8)}... (${node.changedFiles.length} changed files)`);

    return node.id;
  } catch (error) {
    logger.error('Failed to commit context:', error);
    cortexError.set('Failed to save context snapshot');

    return null;
  } finally {
    cortexLoading.set(false);
  }
}

/**
 * Create a new branch from the current HEAD.
 * This is the equivalent of `git checkout -b`.
 */
export async function createNewBranch(name: string): Promise<boolean> {
  const db = await getDB();
  const chatId = cortexChatId.get();
  const head = cortexHead.get();
  const branches = cortexBranches.get();

  if (!db || !chatId || !head) {
    return false;
  }

  // Check if branch already exists
  if (branches.some((b) => b.name === name)) {
    cortexError.set(`Branch '${name}' already exists`);
    return false;
  }

  try {
    // Get current HEAD node ID
    let headNodeId: NodeId | undefined;

    if (head.isDetached && head.nodeId) {
      headNodeId = head.nodeId;
    } else {
      const currentBranch = branches.find((b) => b.name === head.branchName);
      headNodeId = currentBranch?.headNodeId;
    }

    if (!headNodeId) {
      cortexError.set('No HEAD node to branch from');
      return false;
    }

    // Create branch
    const branch = createBranchRef(name, chatId, headNodeId);
    await saveBranchRef(db, branch);

    // Switch HEAD to new branch
    const newHead: HeadPointer = {
      chatId,
      branchName: name,
      isDetached: false,
    };
    await saveHead(db, newHead);

    cortexBranches.set([...branches, branch]);
    cortexHead.set(newHead);

    logger.info(`Created branch '${name}' at ${headNodeId.slice(0, 8)}`);

    return true;
  } catch (error) {
    logger.error(`Failed to create branch '${name}':`, error);
    cortexError.set(`Failed to create branch '${name}'`);

    return false;
  }
}

/**
 * Switch to a different branch.
 * Returns the files at the branch's HEAD for restoration.
 */
export async function checkoutBranch(branchName: string): Promise<Record<string, string> | null> {
  const db = await getDB();
  const chatId = cortexChatId.get();

  if (!db || !chatId) {
    return null;
  }

  try {
    const branch = await getBranch(db, chatId, branchName);

    if (!branch) {
      cortexError.set(`Branch '${branchName}' not found`);
      return null;
    }

    const nodes = cortexNodes.get();
    const files = reconstructFiles(nodes, branch.headNodeId);

    // Update HEAD
    const newHead: HeadPointer = {
      chatId,
      branchName,
      isDetached: false,
    };
    await saveHead(db, newHead);
    cortexHead.set(newHead);

    logger.info(`Checked out branch '${branchName}' (${Object.keys(files).length} files)`);

    return files;
  } catch (error) {
    logger.error(`Failed to checkout branch '${branchName}':`, error);
    cortexError.set(`Failed to checkout '${branchName}'`);

    return null;
  }
}

/**
 * Checkout a specific node (detached HEAD).
 * Returns the files at that node for restoration.
 */
export async function checkoutNode(nodeId: NodeId): Promise<Record<string, string> | null> {
  const db = await getDB();
  const chatId = cortexChatId.get();

  if (!db || !chatId) {
    return null;
  }

  try {
    const nodes = cortexNodes.get();
    const node = nodes.find((n) => n.id === nodeId);

    if (!node) {
      cortexError.set('Node not found');
      return null;
    }

    const files = reconstructFiles(nodes, nodeId);

    // Set detached HEAD
    const newHead: HeadPointer = {
      chatId,
      branchName: '',
      nodeId,
      isDetached: true,
    };
    await saveHead(db, newHead);
    cortexHead.set(newHead);

    logger.info(`Checked out node ${nodeId.slice(0, 8)} (detached HEAD, ${Object.keys(files).length} files)`);

    return files;
  } catch (error) {
    logger.error(`Failed to checkout node ${nodeId.slice(0, 8)}:`, error);
    cortexError.set('Failed to checkout node');

    return null;
  }
}

/**
 * Delete a branch (cannot delete the current branch or default branch).
 */
export async function deleteBranch(branchName: string): Promise<boolean> {
  const db = await getDB();
  const chatId = cortexChatId.get();
  const head = cortexHead.get();
  const branches = cortexBranches.get();

  if (!db || !chatId) {
    return false;
  }

  const branch = branches.find((b) => b.name === branchName);

  if (!branch) {
    cortexError.set(`Branch '${branchName}' not found`);
    return false;
  }

  if (branch.isDefault) {
    cortexError.set('Cannot delete the default branch');
    return false;
  }

  if (head && !head.isDetached && head.branchName === branchName) {
    cortexError.set('Cannot delete the currently active branch');
    return false;
  }

  try {
    await deleteBranchRef(db, chatId, branchName);
    cortexBranches.set(branches.filter((b) => b.name !== branchName));
    logger.info(`Deleted branch '${branchName}'`);

    return true;
  } catch (error) {
    logger.error(`Failed to delete branch '${branchName}':`, error);

    return false;
  }
}

/**
 * Merge another branch into the current branch.
 */
export async function mergeInto(
  sourceBranchName: string,
  strategy: MergeStrategy = 'newer-wins',
): Promise<MergeResult> {
  const db = await getDB();
  const chatId = cortexChatId.get();
  const head = cortexHead.get();
  const branches = cortexBranches.get();
  const nodes = cortexNodes.get();

  if (!db || !chatId || !head || head.isDetached) {
    return { success: false };
  }

  const currentBranch = branches.find((b) => b.name === head.branchName);
  const sourceBranch = branches.find((b) => b.name === sourceBranchName);

  if (!currentBranch || !sourceBranch) {
    cortexError.set('Branch not found');
    return { success: false };
  }

  try {
    const result = await mergeBranches(nodes, currentBranch.headNodeId, sourceBranch.headNodeId, chatId, strategy);

    if (result.success && result.mergedNodeId) {
      // The merge created a new node — save it and advance branch
      const mergeNode = await createNode({
        parents: [currentBranch.headNodeId, sourceBranch.headNodeId],
        chatId,
        messageIndex: 0,
        messageCount: 0,
        changeSummary: `Merge '${sourceBranchName}' into '${head.branchName}'`,
        currentFiles: {},
        previousFiles: {},
      });

      await saveNode(db, mergeNode);

      const updatedBranch = advanceBranch(currentBranch, mergeNode.id);
      await saveBranchRef(db, updatedBranch);

      cortexNodes.set([...nodes, mergeNode]);
      cortexBranches.set(branches.map((b) => (b.name === updatedBranch.name ? updatedBranch : b)));

      logger.info(`Merged '${sourceBranchName}' into '${head.branchName}'`);
    }

    return result;
  } catch (error) {
    logger.error(`Failed to merge '${sourceBranchName}':`, error);
    cortexError.set(`Failed to merge '${sourceBranchName}'`);

    return { success: false };
  }
}

/**
 * Reset the cortex (clear all data for current chat).
 */
export async function resetCortex(): Promise<void> {
  const db = await getDB();
  const chatId = cortexChatId.get();

  if (!db || !chatId) {
    return;
  }

  try {
    await deleteGraphForChat(db, chatId);

    cortexNodes.set([]);
    cortexBranches.set([]);
    cortexHead.set(null);
    cortexInitialized.set(false);

    logger.info(`Cortex reset for chat ${chatId}`);
  } catch (error) {
    logger.error('Failed to reset cortex:', error);
  }
}

/**
 * Cleanup when leaving a chat.
 */
export function cleanupCortex(): void {
  cortexChatId.set(null);
  cortexNodes.set([]);
  cortexBranches.set([]);
  cortexHead.set(null);
  cortexInitialized.set(false);
  cortexLoading.set(false);
  cortexError.set(null);
  cortexDirty.set({ files: false, messages: false });
}
