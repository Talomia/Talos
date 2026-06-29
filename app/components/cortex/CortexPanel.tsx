/**
 * CortexPanel — Context Graph Visualization & Controls
 * =====================================================
 * A collapsible panel that shows the ContextGraph state for the current chat.
 * Provides branch navigation, commit history, and context statistics.
 */

import { useStore } from '@nanostores/react';
import { memo, useState, useCallback } from 'react';
import { classNames } from '~/utils/classNames';
import {
  cortexInitialized,
  cortexNodes,
  cortexBranches,
  cortexLoading,
  cortexError,
  cortexPanelOpen,
  cortexActiveTab,
  activeBranch,
  graphStats,
  cortexDirty,
  createNewBranch,
  checkoutBranch,
  deleteBranch,
} from '~/lib/stores/cortex';
import type { ContextNode, ContextBranch } from '~/lib/persistence/contextGraph';

/*
 * ==========================================
 * Panel Header
 * ==========================================
 */

const PanelHeader = memo(() => {
  const isOpen = useStore(cortexPanelOpen);
  const branch = useStore(activeBranch);
  const dirty = useStore(cortexDirty);
  const loading = useStore(cortexLoading);

  const hasDirtyChanges = dirty.files || dirty.messages;

  return (
    <button
      onClick={() => cortexPanelOpen.set(!isOpen)}
      className={classNames(
        'flex items-center gap-2 w-full px-3 py-2',
        'text-sm font-medium',
        'bg-ui-background-depth-2 hover:bg-ui-background-depth-3',
        'border-b border-ui-borderColor',
        'transition-colors duration-150',
      )}
    >
      <div className={classNames('i-ph:git-branch text-lg', branch ? 'text-accent-400' : 'text-ui-textTertiary')} />

      <span className="text-ui-textPrimary flex-1 text-left truncate">{branch ? branch.name : 'No branch'}</span>

      {hasDirtyChanges && (
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Uncommitted changes" />
      )}

      {loading && <div className="i-ph:spinner-gap animate-spin text-ui-textTertiary" />}

      <div
        className={classNames(
          'i-ph:caret-down text-ui-textTertiary transition-transform duration-200',
          isOpen && 'rotate-180',
        )}
      />
    </button>
  );
});

PanelHeader.displayName = 'CortexPanelHeader';

/*
 * ==========================================
 * Branch List
 * ==========================================
 */

interface BranchItemProps {
  branch: ContextBranch;
  isActive: boolean;
  onCheckout: (name: string) => void;
  onDelete: (name: string) => void;
}

const BranchItem = memo(({ branch, isActive, onCheckout, onDelete }: BranchItemProps) => {
  return (
    <div
      className={classNames(
        'flex items-center gap-2 px-3 py-1.5 text-sm',
        'hover:bg-ui-background-depth-3 transition-colors',
        isActive && 'bg-ui-background-depth-3',
      )}
    >
      <div className={classNames('i-ph:git-branch text-sm', isActive ? 'text-accent-400' : 'text-ui-textTertiary')} />

      <span
        className={classNames(
          'flex-1 truncate',
          isActive ? 'text-ui-textPrimary font-medium' : 'text-ui-textSecondary',
        )}
      >
        {branch.name}
      </span>

      {branch.isDefault && (
        <span className="text-xs text-ui-textTertiary bg-ui-background-depth-1 px-1.5 py-0.5 rounded">default</span>
      )}

      {!isActive && (
        <button
          onClick={() => onCheckout(branch.name)}
          className="text-xs text-accent-400 hover:text-accent-300 transition-colors"
          title={`Switch to ${branch.name}`}
        >
          checkout
        </button>
      )}

      {!isActive && !branch.isDefault && (
        <button
          onClick={() => onDelete(branch.name)}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
          title={`Delete ${branch.name}`}
        >
          <div className="i-ph:trash text-sm" />
        </button>
      )}
    </div>
  );
});

BranchItem.displayName = 'CortexBranchItem';

const BranchTab = memo(() => {
  const branches = useStore(cortexBranches);
  const currentBranch = useStore(activeBranch);
  const [newBranchName, setNewBranchName] = useState('');
  const [showNewBranch, setShowNewBranch] = useState(false);

  const handleCheckout = useCallback(async (name: string) => {
    await checkoutBranch(name);
  }, []);

  const handleDelete = useCallback(async (name: string) => {
    if (confirm(`Delete branch '${name}'? This cannot be undone.`)) {
      await deleteBranch(name);
    }
  }, []);

  const handleCreateBranch = useCallback(async () => {
    if (newBranchName.trim()) {
      const success = await createNewBranch(newBranchName.trim());

      if (success) {
        setNewBranchName('');
        setShowNewBranch(false);
      }
    }
  }, [newBranchName]);

  return (
    <div className="flex flex-col">
      {branches.length === 0 ? (
        <div className="px-3 py-4 text-sm text-ui-textTertiary text-center">
          No branches yet. Commit to create the first branch.
        </div>
      ) : (
        branches.map((branch) => (
          <BranchItem
            key={`${branch.chatId}-${branch.name}`}
            branch={branch}
            isActive={currentBranch?.name === branch.name}
            onCheckout={handleCheckout}
            onDelete={handleDelete}
          />
        ))
      )}

      {showNewBranch ? (
        <div className="flex items-center gap-1 px-3 py-2 border-t border-ui-borderColor">
          <input
            type="text"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
            placeholder="branch-name"
            className="flex-1 text-sm bg-transparent border border-ui-borderColor rounded px-2 py-1 text-ui-textPrimary placeholder:text-ui-textTertiary focus:outline-none focus:border-accent-400"
            autoFocus
          />

          <button onClick={handleCreateBranch} className="text-sm text-accent-400 hover:text-accent-300 px-2 py-1">
            Create
          </button>

          <button
            onClick={() => setShowNewBranch(false)}
            className="text-sm text-ui-textTertiary hover:text-ui-textSecondary px-1"
          >
            <div className="i-ph:x" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowNewBranch(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-accent-400 hover:text-accent-300 hover:bg-ui-background-depth-3 transition-colors border-t border-ui-borderColor"
        >
          <div className="i-ph:plus" />
          New branch
        </button>
      )}
    </div>
  );
});

BranchTab.displayName = 'CortexBranchTab';

/*
 * ==========================================
 * History Tab
 * ==========================================
 */

const HistoryTab = memo(() => {
  const nodes = useStore(cortexNodes);

  // Show newest first
  const sortedNodes = [...nodes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (sortedNodes.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-ui-textTertiary text-center">
        No context history. Commit to create the first snapshot.
      </div>
    );
  }

  return (
    <div className="flex flex-col max-h-64 overflow-y-auto">
      {sortedNodes.map((node) => (
        <NodeItem key={node.id} node={node} />
      ))}
    </div>
  );
});

HistoryTab.displayName = 'CortexHistoryTab';

const NodeItem = memo(({ node }: { node: ContextNode }) => {
  const date = new Date(node.createdAt);
  const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className="flex items-start gap-2 px-3 py-2 hover:bg-ui-background-depth-3 transition-colors border-b border-ui-borderColor last:border-b-0">
      <div className="mt-1">
        <div
          className={classNames(
            'w-2.5 h-2.5 rounded-full',
            node.parents.length > 1 ? 'bg-accent-400' : 'bg-ui-textTertiary',
          )}
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-ui-textPrimary truncate">{node.changeSummary}</p>

        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-ui-textTertiary">
            {dateStr} {timeStr}
          </span>
          <span className="text-xs text-ui-textTertiary">·</span>
          <span className="text-xs text-ui-textTertiary">{node.changedFiles.length} files</span>
          {node.parents.length > 1 && <span className="text-xs text-accent-400">merge</span>}
        </div>
      </div>

      <span className="text-xs font-mono text-ui-textTertiary mt-0.5" title={node.id}>
        {node.id.slice(0, 7)}
      </span>
    </div>
  );
});

NodeItem.displayName = 'CortexNodeItem';

/*
 * ==========================================
 * Stats Tab
 * ==========================================
 */

const StatsTab = memo(() => {
  const stats = useStore(graphStats);

  if (!stats) {
    return <div className="px-3 py-4 text-sm text-ui-textTertiary text-center">No statistics available yet.</div>;
  }

  const statItems = [
    { label: 'Nodes', value: stats.nodeCount, icon: 'i-ph:circles-three' },
    { label: 'Branches', value: stats.branchCount, icon: 'i-ph:git-branch' },
    { label: 'Files Tracked', value: stats.totalFilesTracked, icon: 'i-ph:files' },
    { label: 'Est. Tokens', value: stats.estimatedTokens.toLocaleString(), icon: 'i-ph:hash' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {statItems.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2 p-2 rounded-lg bg-ui-background-depth-1 border border-ui-borderColor"
        >
          <div className={classNames(item.icon, 'text-lg text-accent-400')} />

          <div>
            <div className="text-sm font-medium text-ui-textPrimary">{item.value}</div>
            <div className="text-xs text-ui-textTertiary">{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
});

StatsTab.displayName = 'CortexStatsTab';

/*
 * ==========================================
 * Main Panel
 * ==========================================
 */

export const CortexPanel = memo(() => {
  const isOpen = useStore(cortexPanelOpen);
  const activeTab = useStore(cortexActiveTab);
  const initialized = useStore(cortexInitialized);
  const error = useStore(cortexError);

  if (!initialized) {
    return null;
  }

  const tabs = [
    { id: 'branches' as const, label: 'Branches', icon: 'i-ph:git-branch' },
    { id: 'history' as const, label: 'History', icon: 'i-ph:clock-counter-clockwise' },
    { id: 'stats' as const, label: 'Stats', icon: 'i-ph:chart-bar' },
  ];

  return (
    <div className="border-b border-ui-borderColor">
      <PanelHeader />

      {isOpen && (
        <div className="bg-ui-background-depth-1">
          {/* Tab Bar */}
          <div className="flex border-b border-ui-borderColor">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => cortexActiveTab.set(tab.id)}
                className={classNames(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                  activeTab === tab.id
                    ? 'text-accent-400 border-b-2 border-accent-400'
                    : 'text-ui-textTertiary hover:text-ui-textSecondary',
                )}
              >
                <div className={classNames(tab.icon, 'text-sm')} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="px-3 py-2 text-xs text-red-400 bg-red-400/10 border-b border-red-400/20">{error}</div>
          )}

          {/* Tab Content */}
          {activeTab === 'branches' && <BranchTab />}
          {activeTab === 'history' && <HistoryTab />}
          {activeTab === 'stats' && <StatsTab />}
        </div>
      )}
    </div>
  );
});

CortexPanel.displayName = 'CortexPanel';
