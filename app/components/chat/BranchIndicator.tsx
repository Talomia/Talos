import { useEffect, useState } from 'react';
import { useNavigate } from '@remix-run/react';
import { chatId } from '~/lib/persistence';
import { getBranchById, getMessages, type ContextBranch } from '~/lib/persistence/db';
import { getDb } from '~/lib/persistence/useChatHistory';
import { useStore } from '@nanostores/react';

export function BranchIndicator() {
  const currentChatId = useStore(chatId);
  const navigate = useNavigate();
  const [branch, setBranch] = useState<ContextBranch | null>(null);
  const [parentName, setParentName] = useState<string>('');

  useEffect(() => {
    if (!currentChatId) {
      setBranch(null);
      setParentName('');

      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        const db = await getDb();

        if (!db || cancelled) {
          return;
        }

        const branchData = await getBranchById(db, currentChatId);

        if (!branchData || cancelled) {
          setBranch(null);
          setParentName('');

          return;
        }

        setBranch(branchData);

        const parentChat = await getMessages(db, branchData.parentChatId);

        if (!cancelled) {
          setParentName(parentChat?.description || 'Unknown Chat');
        }
      } catch {
        if (!cancelled) {
          setBranch(null);
          setParentName('');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentChatId]);

  if (!branch) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-purple-500/5 border-b border-purple-500/10 max-w-chat mx-auto w-full">
      <span className="i-ph:git-fork text-purple-400 text-xs" />
      <span className="text-xs text-purple-400/80">
        Forked from{' '}
        <button
          onClick={() => navigate(`/chat/${branch.parentChatId}`)}
          className="text-purple-400 hover:text-purple-300 underline underline-offset-2"
        >
          {parentName}
        </button>{' '}
        at message #{branch.forkMessageIndex + 1}
      </span>
    </div>
  );
}
