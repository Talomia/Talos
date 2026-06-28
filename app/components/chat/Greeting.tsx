import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { profileStore } from '~/lib/stores/profile';
import { isMac } from '~/utils/os';

function getTimeGreeting(): string {
  const hour = new Date().getHours();

  if (hour < 12) {
    return 'Good morning';
  }

  if (hour < 17) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

export function Greeting() {
  const profile = useStore(profileStore);
  const [greeting, setGreeting] = useState(getTimeGreeting);
  const name = profile?.username?.trim();
  const shortcutKey = isMac ? '⌘' : 'Ctrl+';

  // Re-evaluate greeting every 5 minutes so it updates if user leaves the tab open
  useEffect(() => {
    const interval = setInterval(
      () => {
        setGreeting(getTimeGreeting());
      },
      5 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, []);

  return (
    <div id="intro" className="mt-[16vh] max-w-2xl mx-auto text-center px-4 lg:px-0">
      <h1 className="text-3xl lg:text-6xl font-bold text-ui-textPrimary mb-4 landing-fade-in-up">
        {greeting}
        {name ? `, ${name}` : ''} 👋
      </h1>
      <p
        className="text-md lg:text-xl mb-8 text-ui-textSecondary landing-fade-in-up"
        style={{ animationDelay: '0.08s' }}
      >
        Bring ideas to life in seconds or get help on existing projects.
      </p>
      <button
        className="landing-fade-in-up inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ui-background-depth-2 text-sm text-ui-textTertiary hover:text-ui-textSecondary transition-colors cursor-pointer border border-transparent hover:border-ui-borderColor"
        style={{ animationDelay: '0.14s' }}
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
        aria-label="Open command palette"
      >
        <kbd className="font-mono text-xs px-1.5 py-0.5 rounded bg-ui-background-depth-3 border border-ui-borderColor">
          {shortcutKey}K
        </kbd>
        <span>to search commands</span>
      </button>
    </div>
  );
}
