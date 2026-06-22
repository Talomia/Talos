import type { ActionType, CodeAction, CodeActionData, FileAction, ShellAction, SupabaseAction } from '~/types/actions';
import type { ArtifactData } from '~/types/artifact';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import {
  ARTIFACT_TAG_OPEN,
  ARTIFACT_TAG_CLOSE,
  ACTION_TAG_OPEN,
  ACTION_TAG_CLOSE,
  QUICK_ACTIONS_TAG_OPEN,
  QUICK_ACTIONS_TAG_CLOSE,
  CSS_CLASS_ARTIFACT,
  CSS_CLASS_QUICK_ACTION,
  QUICK_ACTION_ELEMENT,
} from '~/lib/app-config';

const logger = createScopedLogger('MessageParser');

export interface ArtifactCallbackData extends ArtifactData {
  messageId: string;
  artifactId?: string;
}

export interface ActionCallbackData {
  artifactId: string;
  messageId: string;
  actionId: string;
  action: CodeAction;
}

export type ArtifactCallback = (data: ArtifactCallbackData) => void;
export type ActionCallback = (data: ActionCallbackData) => void;

export interface ParserCallbacks {
  onArtifactOpen?: ArtifactCallback;
  onArtifactClose?: ArtifactCallback;
  onActionOpen?: ActionCallback;
  onActionStream?: ActionCallback;
  onActionClose?: ActionCallback;
}

interface ElementFactoryProps {
  messageId: string;
  artifactId?: string;
}

type ElementFactory = (props: ElementFactoryProps) => string;

export interface StreamingMessageParserOptions {
  callbacks?: ParserCallbacks;
  artifactElement?: ElementFactory;
}

interface MessageState {
  position: number;
  insideArtifact: boolean;
  insideAction: boolean;
  artifactCounter: number;
  currentArtifact?: ArtifactData;
  currentAction: CodeActionData;
  actionId: number;
}

function cleanoutMarkdownSyntax(content: string) {
  const codeBlockRegex = /^\s*```\w*\n([\s\S]*?)\n\s*```\s*$/;
  const match = content.match(codeBlockRegex);



  if (match) {
    return match[1]; // Remove common leading 4-space indent
  } else {
    return content;
  }
}

function cleanEscapedTags(content: string) {
  return content
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
const MAX_PARSED_MESSAGES = 50;

export class StreamingMessageParser {
  #messages = new Map<string, MessageState>();
  #artifactCounter = 0;

  constructor(private _options: StreamingMessageParserOptions = {}) {}

  parse(messageId: string, input: string) {
    let state = this.#messages.get(messageId);

    if (!state) {
      state = {
        position: 0,
        insideArtifact: false,
        insideAction: false,
        artifactCounter: 0,
        currentAction: { content: '' },
        actionId: 0,
      };

      this.#messages.set(messageId, state);

      // Prune old messages to prevent unbounded growth (skip actively-streaming ones)
      if (this.#messages.size > MAX_PARSED_MESSAGES) {
        for (const [key, msgState] of this.#messages) {
          if (key === messageId) {
            continue;
          }

          if (!msgState.insideArtifact && !msgState.insideAction) {
            this.#messages.delete(key);
            break;
          }
        }
      }
    }

    let output = '';
    let i = state.position;
    let earlyBreak = false;

    while (i < input.length) {
      // Check for quick-actions open tag
      const quickActionsOpenLen = input.startsWith(QUICK_ACTIONS_TAG_OPEN, i) ? QUICK_ACTIONS_TAG_OPEN.length : 0;

      if (quickActionsOpenLen > 0) {
        const actionsBlockEnd = input.indexOf(QUICK_ACTIONS_TAG_CLOSE, i);

        if (actionsBlockEnd !== -1) {
          const actionsBlockContent = input.slice(i + quickActionsOpenLen, actionsBlockEnd);

          // Find all <quick-action ...>label</quick-action> inside
          const quickActionRegex = new RegExp(
            `<${QUICK_ACTION_ELEMENT}([^>]*)>([\s\S]*?)<\/${QUICK_ACTION_ELEMENT}>`,
            'g',
          );
          let match;
          const buttons = [];

          while ((match = quickActionRegex.exec(actionsBlockContent)) !== null) {
            const tagAttrs = match[1];
            const label = match[2];
            const type = this.#extractAttribute(tagAttrs, 'type');
            const message = this.#extractAttribute(tagAttrs, 'message');
            const path = this.#extractAttribute(tagAttrs, 'path');
            const href = this.#extractAttribute(tagAttrs, 'href');
            buttons.push(
              createQuickActionElement(
                { type: type || '', message: message || '', path: path || '', href: href || '' },
                label,
              ),
            );
          }
          output += createQuickActionGroup(buttons);

          const closeLen = QUICK_ACTIONS_TAG_CLOSE.length;
          i = actionsBlockEnd + closeLen;
          continue;
        }
      }

      if (state.insideArtifact) {
        const currentArtifact = state.currentArtifact;

        if (currentArtifact === undefined) {
          unreachable('Artifact not initialized');
        }

        if (state.insideAction) {
          const closeIndex = input.indexOf(ACTION_TAG_CLOSE, i);
          const currentAction = state.currentAction;

          if (closeIndex !== -1) {
            currentAction.content += input.slice(i, closeIndex);

            let content = currentAction.content.trim();

            if ('type' in currentAction && currentAction.type === 'file') {
              // Remove markdown code block syntax if present and file is not markdown
              if (!currentAction.filePath.endsWith('.md')) {
                content = cleanoutMarkdownSyntax(content);
                content = cleanEscapedTags(content);
              }

              content += '\n';
            }

            currentAction.content = content;

            try {
              this._options.callbacks?.onActionClose?.({
                artifactId: currentArtifact.id,
                messageId,

                /**
                 * We decrement the id because it's been incremented already
                 * when `onActionOpen` was emitted to make sure the ids are
                 * the same.
                 */
                actionId: String(state.actionId - 1),

                action: currentAction as CodeAction,
              });
            } catch (callbackError) {
              logger.error('Callback error in onActionClose:', callbackError);
            }

            state.insideAction = false;
            state.currentAction = { content: '' };

            const actionCloseLen = ACTION_TAG_CLOSE.length;
            i = closeIndex + actionCloseLen;
          } else {
            if ('type' in currentAction && currentAction.type === 'file') {
              let content = input.slice(i);

              if (!currentAction.filePath.endsWith('.md')) {
                content = cleanoutMarkdownSyntax(content);
                content = cleanEscapedTags(content);
              }

              try {
                this._options.callbacks?.onActionStream?.({
                  artifactId: currentArtifact.id,
                  messageId,
                  actionId: String(state.actionId - 1),
                  action: {
                    ...(currentAction as FileAction),
                    content,
                    filePath: currentAction.filePath,
                  },
                });
              } catch (callbackError) {
                logger.error('Callback error in onActionStream:', callbackError);
              }
            }

            break;
          }
        } else {
          const actionOpenIndex = input.indexOf(ACTION_TAG_OPEN, i);
          const artifactCloseIndex = input.indexOf(ARTIFACT_TAG_CLOSE, i);

          if (actionOpenIndex !== -1 && (artifactCloseIndex === -1 || actionOpenIndex < artifactCloseIndex)) {
            const actionEndIndex = input.indexOf('>', actionOpenIndex);

            if (actionEndIndex !== -1) {
              state.insideAction = true;

              state.currentAction = this.#parseActionTag(input, actionOpenIndex, actionEndIndex);

              try {
                this._options.callbacks?.onActionOpen?.({
                  artifactId: currentArtifact.id,
                  messageId,
                  actionId: String(state.actionId++),
                  action: state.currentAction as CodeAction,
                });
              } catch (callbackError) {
                logger.error('Callback error in onActionOpen:', callbackError);
              }

              i = actionEndIndex + 1;
            } else {
              break;
            }
          } else if (artifactCloseIndex !== -1) {
            try {
              this._options.callbacks?.onArtifactClose?.({
                messageId,
                artifactId: currentArtifact.id,
                ...currentArtifact,
              });
            } catch (callbackError) {
              logger.error('Callback error in onArtifactClose:', callbackError);
            }

            state.insideArtifact = false;
            state.currentArtifact = undefined;

            const artifactCloseLen = ARTIFACT_TAG_CLOSE.length;
            i = artifactCloseIndex + artifactCloseLen;
          } else {
            break;
          }
        }
      } else if (input[i] === '<' && input[i + 1] !== '/') {
        let j = i;
        let potentialTag = '';

        const maxTagLen = ARTIFACT_TAG_OPEN.length;

        while (j < input.length && potentialTag.length < maxTagLen) {
          potentialTag += input[j];

          if (potentialTag === ARTIFACT_TAG_OPEN) {
            const nextChar = input[j + 1];

            if (nextChar && nextChar !== '>' && nextChar !== ' ') {
              output += input.slice(i, j + 1);
              i = j + 1;
              break;
            }

            const openTagEnd = input.indexOf('>', j);

            if (openTagEnd !== -1) {
              const artifactTag = input.slice(i, openTagEnd + 1);

              const artifactTitle = this.#extractAttribute(artifactTag, 'title') as string;
              const type = this.#extractAttribute(artifactTag, 'type') as string;

              // const artifactId = this.#extractAttribute(artifactTag, 'id') as string;
              const artifactId = `${messageId}-${state.artifactCounter++}`;

              if (!artifactTitle) {
                logger.warn('Artifact title missing');
              }

              state.insideArtifact = true;

              const currentArtifact = {
                id: artifactId,
                title: artifactTitle,
                type,
              } satisfies ArtifactData;

              state.currentArtifact = currentArtifact;

              try {
                this._options.callbacks?.onArtifactOpen?.({
                  messageId,
                  artifactId: currentArtifact.id,
                  ...currentArtifact,
                });
              } catch (callbackError) {
                logger.error('Callback error in onArtifactOpen:', callbackError);
              }

              const artifactFactory = this._options.artifactElement ?? createArtifactElement;

              output += artifactFactory({ messageId, artifactId });

              i = openTagEnd + 1;
            } else {
              earlyBreak = true;
            }

            break;
          } else if (!ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
            output += input.slice(i, j + 1);
            i = j + 1;
            break;
          }

          j++;
        }

        if (j === input.length && ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
          break;
        }
      } else {
        /*
         * Note: Auto-file-creation from code blocks is now handled by EnhancedMessageParser
         * to avoid duplicate processing and provide better shell command detection
         */
        output += input[i];
        i++;
      }

      if (earlyBreak) {
        break;
      }
    }

    state.position = i;

    return output;
  }

  reset() {
    this.#messages.clear();
  }

  #parseActionTag(input: string, actionOpenIndex: number, actionEndIndex: number) {
    const actionTag = input.slice(actionOpenIndex, actionEndIndex + 1);

    const actionType = this.#extractAttribute(actionTag, 'type') as ActionType;

    const actionAttributes = {
      type: actionType,
      content: '',
    };

    if (actionType === 'supabase') {
      const operation = this.#extractAttribute(actionTag, 'operation');

      if (!operation || !['migration', 'query'].includes(operation)) {
        logger.warn(`Invalid or missing operation for Supabase action: ${operation}`);
        return { type: 'shell' as ActionType, content: `echo "Invalid Supabase operation: ${operation}"` };
      }

      (actionAttributes as SupabaseAction).operation = operation as 'migration' | 'query';

      if (operation === 'migration') {
        const filePath = this.#extractAttribute(actionTag, 'filePath');

        if (!filePath) {
          logger.warn('Migration requires a filePath');
          return { type: 'shell' as ActionType, content: 'echo "Migration requires a filePath"' };
        }

        (actionAttributes as SupabaseAction).filePath = filePath;
      }
    } else if (actionType === 'file') {
      const filePath = this.#extractAttribute(actionTag, 'filePath') as string;

      if (!filePath) {
        logger.debug('File path not specified');
      }

      (actionAttributes as FileAction).filePath = filePath;
    } else if (!['shell', 'start'].includes(actionType)) {
      logger.warn(`Unknown action type '${actionType}'`);
    }

    return actionAttributes as FileAction | ShellAction;
  }

  #extractAttribute(tag: string, attributeName: string): string | undefined {
    // Try double-quote match first, then single-quote, to handle embedded quotes in values
    const doubleMatch = tag.match(new RegExp(`${attributeName}="([^"]*)"`, 'i'));
    if (doubleMatch) return doubleMatch[1];
    const singleMatch = tag.match(new RegExp(`${attributeName}='([^']*)'`, 'i'));
    return singleMatch ? singleMatch[1] : undefined;
  }
}

const createArtifactElement: ElementFactory = (props) => {
  const elementProps = [
    `class="${CSS_CLASS_ARTIFACT}"`,
    ...Object.entries(props).map(([key, value]) => {
      return `data-${camelToDashCase(key)}=${JSON.stringify(value)}`;
    }),
  ];

  return `<div ${elementProps.join(' ')}></div>`;
};

function camelToDashCase(input: string) {
  return input.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function createQuickActionElement(props: Record<string, string>, label: string) {
  const elementProps = [
    `class="${CSS_CLASS_QUICK_ACTION}"`,
    'data-quick-action="true"',
    ...Object.entries(props).map(([key, value]) => `data-${camelToDashCase(key)}=${JSON.stringify(value)}`),
  ];

  return `<button ${elementProps.join(' ')}>${label}</button>`;
}

function createQuickActionGroup(buttons: string[]) {
  return `<div class="${CSS_CLASS_QUICK_ACTION}" data-quick-action="true">${buttons.join('')}</div>`;
}
