import { useParams } from '@remix-run/react';
import { classNames } from '~/utils/classNames';
import { type ChatHistoryItem } from '~/lib/persistence';
import WithTooltip from '~/components/ui/Tooltip';
import { useEditChatDescription } from '~/lib/hooks';
import { forwardRef, memo, type ForwardedRef, useCallback } from 'react';
import { Checkbox } from '~/components/ui/Checkbox';
import { toast } from 'react-toastify';
import { formatDistanceToNow } from 'date-fns';

interface HistoryItemProps {
  item: ChatHistoryItem;
  onDelete?: (event: React.UIEvent) => void;
  onDuplicate?: (id: string) => void;
  exportChat: (id?: string) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (id: string) => void;
  isDeleting?: boolean;
  isPinned?: boolean;
  onTogglePin?: (id: string) => void;
  isFork?: boolean;
  parentDescription?: string;
  branchCount?: number;
}

export const HistoryItem = memo(
  ({
    item,
    onDelete,
    onDuplicate,
    exportChat,
    selectionMode = false,
    isSelected = false,
    onToggleSelection,
    isDeleting = false,
    isPinned = false,
    onTogglePin,
    isFork = false,
    parentDescription,
    branchCount = 0,
  }: HistoryItemProps) => {
    const { id: urlId } = useParams();
    const isActiveChat = urlId === item.urlId;

    const { editing, handleChange, handleBlur, handleSubmit, handleKeyDown, currentDescription, toggleEditMode } =
      useEditChatDescription({
        initialDescription: item.description,
        customChatId: item.id,
        syncWithGlobalStore: isActiveChat,
      });

    const handleItemClick = useCallback(
      (e: React.MouseEvent) => {
        if (selectionMode) {
          e.preventDefault();
          e.stopPropagation();
          onToggleSelection?.(item.id);
        }
      },
      [selectionMode, item.id, onToggleSelection],
    );

    const handleCheckboxChange = useCallback(() => {
      onToggleSelection?.(item.id);
    }, [item.id, onToggleSelection]);

    const handleDeleteClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
        event.preventDefault();
        event.stopPropagation();

        if (isDeleting) {
          return;
        }

        if (onDelete) {
          onDelete(event as unknown as React.UIEvent);
        }
      },
      [onDelete, item.id, isDeleting],
    );

    const handleItemKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();

          if (selectionMode) {
            onToggleSelection?.(item.id);
          } else {
            window.location.href = `/chat/${item.urlId}`;
          }
        }
      },
      [selectionMode, item.id, item.urlId, onToggleSelection],
    );

    return (
      <div
        className={classNames(
          'group rounded-lg text-sm text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-item-backgroundActive overflow-hidden flex justify-between items-center px-3 py-2 transition-colors',
          {
            'text-ui-textPrimary bg-ui-item-backgroundActive border-l-2 border-l-accent-500': isActiveChat,
          },
          { 'cursor-pointer': selectionMode },
        )}
        onClick={selectionMode ? handleItemClick : undefined}
        tabIndex={0}
        onKeyDown={handleItemKeyDown}
      >
        {selectionMode && (
          <div className="flex items-center mr-2" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              id={`select-${item.id}`}
              checked={isSelected}
              onCheckedChange={handleCheckboxChange}
              className="h-4 w-4"
            />
          </div>
        )}

        {editing ? (
          <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
            <input
              type="text"
              className="flex-1 bg-ui-background-depth-1 text-ui-textPrimary rounded-md px-3 py-1.5 text-sm border border-ui-borderColor focus:outline-none focus:ring-1 focus:ring-accent-500/50"
              autoFocus
              value={currentDescription}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
            />
            <button
              type="submit"
              className="i-ph:check h-4 w-4 text-ui-textTertiary hover:text-accent-500 transition-colors"
              onMouseDown={handleSubmit}
              aria-label="Save chat name"
            />
          </form>
        ) : (
          <a
            href={`/chat/${item.urlId}`}
            className="flex w-full relative truncate block"
            onClick={selectionMode ? handleItemClick : undefined}
          >
            <WithTooltip tooltip={currentDescription}>
              <div className="truncate pr-24">
                <span className="flex items-center gap-1 truncate">
                  {isPinned && <span className="i-ph:push-pin-fill text-accent-500 text-[10px] shrink-0" />}
                  {isFork && <span className="i-ph:git-fork text-accent-500 text-[10px] shrink-0" />}
                  <span className="truncate">{currentDescription}</span>
                </span>
                <span className="block text-[11px] text-ui-textTertiary font-normal">
                  {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                </span>
                {parentDescription && (
                  <span className="block text-[10px] text-accent-500/70 truncate">↳ from {parentDescription}</span>
                )}
                {branchCount > 0 && (
                  <span className="block text-[10px] text-accent-500/70">
                    {branchCount} branch{branchCount !== 1 ? 'es' : ''}
                  </span>
                )}
              </div>
            </WithTooltip>
            <div
              className={classNames(
                'absolute right-0 top-0 bottom-0 flex items-center bg-transparent px-2 transition-colors',
              )}
            >
              <div className="flex items-center gap-2.5 text-ui-textTertiary opacity-0 group-hover:opacity-100 transition-opacity">
                <ChatActionButton
                  toolTipContent={isPinned ? 'Unpin' : 'Pin to top'}
                  icon={isPinned ? 'i-ph:push-pin-slash h-4 w-4' : 'i-ph:push-pin h-4 w-4'}
                  onClick={(event) => {
                    event.preventDefault();
                    onTogglePin?.(item.id);
                  }}
                />
                <ChatActionButton
                  toolTipContent="Export"
                  icon="i-ph:download-simple h-4 w-4"
                  onClick={(event) => {
                    event.preventDefault();
                    exportChat(item.id);
                  }}
                />
                {onDuplicate && (
                  <ChatActionButton
                    toolTipContent="Duplicate"
                    icon="i-ph:copy h-4 w-4"
                    onClick={(event) => {
                      event.preventDefault();

                      try {
                        onDuplicate?.(item.id);
                      } catch (error) {
                        const message = error instanceof Error ? error.message : 'Failed to duplicate chat';
                        toast.error(message);
                      }
                    }}
                  />
                )}
                <ChatActionButton
                  toolTipContent="Rename"
                  icon="i-ph:pencil-fill h-4 w-4"
                  onClick={(event) => {
                    event.preventDefault();
                    toggleEditMode();
                  }}
                />
                <ChatActionButton
                  toolTipContent={isDeleting ? 'Deleting...' : 'Delete'}
                  icon={isDeleting ? 'i-ph:spinner animate-spin h-4 w-4' : 'i-ph:trash h-4 w-4'}
                  className={
                    isDeleting ? 'opacity-50 pointer-events-none' : 'hover:text-red-500 dark:hover:text-red-400'
                  }
                  onClick={handleDeleteClick}
                />
              </div>
            </div>
          </a>
        )}
      </div>
    );
  },
);

const ChatActionButton = forwardRef(
  (
    {
      toolTipContent,
      icon,
      className,
      onClick,
    }: {
      toolTipContent: string;
      icon: string;
      className?: string;
      onClick: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
      btnTitle?: string;
    },
    ref: ForwardedRef<HTMLButtonElement>,
  ) => {
    return (
      <WithTooltip tooltip={toolTipContent} position="bottom" sideOffset={4}>
        <button
          ref={ref}
          type="button"
          className={`text-ui-textTertiary hover:text-accent-500 transition-colors ${icon} ${className ? className : ''}`}
          onClick={onClick}
          aria-label={toolTipContent}
        />
      </WithTooltip>
    );
  },
);
