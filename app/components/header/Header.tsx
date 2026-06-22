import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { AuthButton } from '~/components/auth/AuthDialog';
import { isMac } from '~/utils/os';

function ShortcutHint() {
  const shortcutKey = isMac ? '⌘' : 'Ctrl+';

  return (
    <div className="flex-1 flex justify-center">
      <button
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-ui-textTertiary hover:text-ui-textSecondary transition-colors cursor-pointer"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
        aria-label="Open command palette"
      >
        <kbd className="font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[11px]">
          {shortcutKey}K
        </kbd>
        <span className="hidden sm:inline">Search commands and chats</span>
      </button>
    </div>
  );
}

export function Header() {
  const chat = useStore(chatStore);

  return (
    <header
      className={classNames('flex items-center px-4 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-ui-borderColor': chat.started,
      })}
    >
      <div className="flex items-center gap-2 z-logo text-ui-textPrimary cursor-pointer">
        <div className="i-ph:sidebar-simple-duotone text-xl" />
        <a href="/" className="text-2xl font-semibold text-accent flex items-center">
          {/* <span className="i-app:logo-text?mask w-[46px] inline-block" /> */}
          <img src="/logo-light-styled.png" alt="logo" className="h-[28px] w-auto inline-block dark:hidden" />
          <img src="/logo-dark-styled.png" alt="logo" className="h-[28px] w-auto inline-block hidden dark:block" />
        </a>
      </div>
      {chat.started && ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
        <>
          <span className="flex-1 px-4 truncate text-center text-ui-textPrimary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div className="">
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        </>
      )}
      {!chat.started && <ClientOnly fallback={<div className="flex-1" />}>{() => <ShortcutHint />}</ClientOnly>}
      <ClientOnly>
        {() => (
          <div className="ml-2">
            <AuthButton />
          </div>
        )}
      </ClientOnly>
    </header>
  );
}
