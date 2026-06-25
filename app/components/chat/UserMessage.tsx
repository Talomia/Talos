import { useState, useCallback } from 'react';
import { MODEL_REGEX, PROVIDER_REGEX } from '~/utils/constants';
import { Markdown } from './Markdown';
import { useStore } from '@nanostores/react';
import { profileStore } from '~/lib/stores/profile';
import type {
  TextUIPart,
  ReasoningUIPart,
  ToolInvocationUIPart,
  SourceUIPart,
  FileUIPart,
  StepStartUIPart,
} from '@ai-sdk/ui-utils';

interface UserMessageProps {
  content: string | Array<{ type: string; text?: string; image?: string }>;
  parts:
    | (TextUIPart | ReasoningUIPart | ToolInvocationUIPart | SourceUIPart | FileUIPart | StepStartUIPart)[]
    | undefined;
  messageId?: string;
  onFork?: (messageId: string) => void;
  onRewind?: (messageId: string) => void;
}

export function UserMessage({ content, parts, messageId, onFork, onRewind }: UserMessageProps) {
  const profile = useStore(profileStore);
  const [copied, setCopied] = useState(false);

  // Extract images from parts - look for file parts with image mime types
  const images = Array.isArray(parts)
    ? parts.filter(
        (part): part is FileUIPart => part.type === 'file' && 'mimeType' in part && part.mimeType.startsWith('image/'),
      )
    : [];

  const textContent = Array.isArray(content)
    ? stripMetadata(content.find((item) => item.type === 'text')?.text || '')
    : stripMetadata(content);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(textContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [textContent]);

  return (
    <div className="group/user relative flex flex-col gap-2">
      {/* Avatar + username row */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-6 h-6 rounded-full overflow-hidden shrink-0 bg-accent-500/10">
          {profile?.avatar ? (
            <img
              src={profile.avatar}
              alt={profile?.username || 'User'}
              className="w-full h-full object-cover"
              loading="eager"
              decoding="sync"
            />
          ) : (
            <div className="i-ph:user-fill text-accent-500 text-sm" />
          )}
        </div>
        {profile?.username && <span className="text-sm font-medium text-ui-textPrimary">{profile.username}</span>}

        {/* Copy button — appears on hover */}
        <button
          onClick={handleCopy}
          className="ml-auto opacity-0 group-hover/user:opacity-100 transition-opacity text-ui-textTertiary hover:text-ui-textSecondary p-1 rounded"
          aria-label="Copy message"
        >
          <span className={copied ? 'i-ph:check text-green-500 text-sm' : 'i-ph:copy text-sm'} />
        </button>
        {/* Fork button — appears on hover */}
        {messageId && onFork && (
          <button
            onClick={() => onFork(messageId)}
            className="opacity-0 group-hover/user:opacity-100 transition-opacity text-ui-textTertiary hover:text-purple-500 p-1 rounded"
            aria-label="Fork from this message"
          >
            <span className="i-ph:git-fork text-sm" />
          </button>
        )}
        {/* Rewind button — appears on hover */}
        {messageId && onRewind && (
          <button
            onClick={() => onRewind(messageId)}
            className="opacity-0 group-hover/user:opacity-100 transition-opacity text-ui-textTertiary hover:text-amber-500 p-1 rounded"
            aria-label="Rewind to this message"
          >
            <span className="i-ph:arrow-counter-clockwise text-sm" />
          </button>
        )}
      </div>

      {/* Message content */}
      <div className="flex flex-col gap-3 bg-accent-500/10 backdrop-blur-sm px-4 py-3 rounded-lg ml-8">
        {images.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {images.map((item, index) => (
              <div key={index} className="relative rounded-lg border border-ui-borderColor overflow-hidden">
                <img
                  src={`data:${item.mimeType};base64,${item.data}`}
                  alt={`Image ${index + 1}`}
                  className="max-h-40 w-auto rounded-lg object-contain"
                />
              </div>
            ))}
          </div>
        )}
        {textContent && <Markdown html>{textContent}</Markdown>}
      </div>
    </div>
  );
}

function stripMetadata(content: string) {
  const artifactRegex = /<artifact\s+[^>]*>[\s\S]*?<\/artifact>/gm;
  return content.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, '').replace(artifactRegex, '');
}
