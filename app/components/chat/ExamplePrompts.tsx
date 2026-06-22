import React from 'react';

const EXAMPLE_PROMPTS = [
  {
    icon: 'i-ph:layout',
    title: 'SaaS Dashboard',
    description: 'Analytics dashboard with charts and dark mode',
    prompt: 'Create a modern SaaS analytics dashboard with charts, sidebar navigation, and dark mode',
  },
  {
    icon: 'i-ph:storefront',
    title: 'E-commerce Store',
    description: 'Product page with hero, pricing, and checkout',
    prompt: 'Build a product landing page with a hero section, feature grid, pricing table, and checkout flow',
  },
  {
    icon: 'i-ph:game-controller',
    title: 'Interactive Game',
    description: '2D platformer with Canvas and controls',
    prompt: 'Make a 2D platformer game with HTML Canvas, keyboard controls, and a score system',
  },
  {
    icon: 'i-ph:chat-circle-dots',
    title: 'Chat Application',
    description: 'Real-time chat with avatars and indicators',
    prompt: 'Build a real-time chat app with message bubbles, user avatars, and typing indicators',
  },
  {
    icon: 'i-ph:article',
    title: 'Blog Platform',
    description: 'Minimal blog with markdown and dark mode',
    prompt: 'Create a minimal blog with markdown rendering, dark mode, and a responsive layout',
  },
  {
    icon: 'i-ph:device-mobile',
    title: 'Mobile App UI',
    description: 'Fitness tracker with charts and navigation',
    prompt: 'Build a fitness tracker mobile app UI with workout cards, progress charts, and a bottom navigation',
  },
];

interface ExamplePromptsProps {
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
}

export function ExamplePrompts({ sendMessage }: ExamplePromptsProps) {
  return (
    <div id="examples" className="relative w-full max-w-2xl mx-auto mt-6 px-4 lg:px-0">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {EXAMPLE_PROMPTS.map((item, index) => (
          <button
            key={index}
            onClick={(event) => {
              sendMessage?.(event, item.prompt);
            }}
            className="landing-fade-in-up group flex flex-col items-start gap-2 p-3.5 rounded-xl border border-ui-borderColor bg-ui-background-depth-2 hover:border-ui-borderColorActive text-left transition-all duration-200 hover:shadow-sm cursor-pointer"
            style={{ animationDelay: `${0.15 + index * 0.06}s` }}
          >
            <span
              className={`${item.icon} text-xl text-ui-textTertiary group-hover:text-ui-button-primary-text transition-colors`}
            />
            <div>
              <div className="text-sm font-medium text-ui-textPrimary">{item.title}</div>
              <div className="text-xs text-ui-textTertiary mt-0.5 line-clamp-2">{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
