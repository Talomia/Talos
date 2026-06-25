import { useRef } from 'react';
import type { Message } from 'ai';
import type { ChatRequestOptions, Attachment, TextUIPart, FileUIPart } from '@ai-sdk/ui-utils';
import Cookies from 'js-cookie';
import { toast } from 'react-toastify';
import { PROMPT_COOKIE_KEY } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';
import { workbenchStore } from '~/lib/stores/workbench';
import { chatStore } from '~/lib/stores/chat';
import { filesToArtifacts } from '~/utils/fileUtils';
import { getTemplates, selectStarterTemplate } from '~/utils/selectStarterTemplate';
import type { ProviderInfo } from '~/types/model';
import type { ElementInfo } from '~/components/workbench/Inspector';

const logger = createScopedLogger('Chat');

// Helper function to create message parts array from text and images
const createMessageParts = (text: string, images: string[] = []): Array<TextUIPart | FileUIPart> => {
  // Create an array of properly typed message parts
  const parts: Array<TextUIPart | FileUIPart> = [
    {
      type: 'text',
      text,
    },
  ];

  // Add image parts if any
  images.forEach((imageData) => {
    // Extract correct MIME type from the data URL
    const mimeType = imageData.split(';')[0].split(':')[1] || 'image/jpeg';

    // Create file part according to AI SDK format
    parts.push({
      type: 'file',
      mimeType,
      data: imageData.replace(/^data:image\/[^;]+;base64,/, ''),
    });
  });

  return parts;
};

// Helper function to convert File[] to Attachment[] for AI SDK
const filesToAttachments = async (files: File[]): Promise<Attachment[] | undefined> => {
  if (files.length === 0) {
    return undefined;
  }

  const attachments = await Promise.all(
    files.map(
      (file) =>
        new Promise<Attachment>((resolve, reject) => {
          const reader = new FileReader();

          reader.onloadend = () => {
            resolve({
              name: file.name,
              contentType: file.type,
              url: reader.result as string,
            });
          };

          reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));

          reader.readAsDataURL(file);
        }),
    ),
  );

  return attachments;
};

export interface UseSendMessageDeps {
  model: string;
  provider: ProviderInfo;
  input: string;
  chatStarted: boolean;
  isLoading: boolean;
  messages: Message[];
  error: Error | undefined;
  autoSelectTemplate: boolean;
  uploadedFiles: File[];
  imageDataList: string[];
  selectedElement: ElementInfo | null;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  append: (
    message: Message | import('@ai-sdk/ui-utils').CreateMessage,
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  reload?: (chatRequestOptions?: ChatRequestOptions) => Promise<string | null | undefined>;
  setMessages: (messages: Message[] | ((messages: Message[]) => Message[])) => void;
  setInput: (input: string) => void;
  setFakeLoading: (loading: boolean) => void;
  setUploadedFiles: (files: File[] | ((prev: File[]) => File[])) => void;
  setImageDataList: (dataList: string[] | ((prev: string[]) => string[])) => void;
  resetEnhancer: () => void;
  abort: () => void;
  runAnimation: () => Promise<void>;
}

export function useSendMessage(deps: UseSendMessageDeps) {
  const {
    model,
    provider,
    input,
    chatStarted,
    isLoading,
    messages,
    error,
    autoSelectTemplate,
    uploadedFiles,
    imageDataList,
    selectedElement,
    textareaRef,
    append,
    setMessages,
    setInput,
    setFakeLoading,
    setUploadedFiles,
    setImageDataList,
    resetEnhancer,
    abort,
    runAnimation,
  } = deps;

  const sendingRef = useRef(false);

  const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
    if (sendingRef.current) {
      return;
    }

    const messageContent = messageInput || input;

    if (!messageContent?.trim()) {
      return;
    }

    if (isLoading) {
      abort();
      return;
    }

    sendingRef.current = true;

    try {
      let finalMessageContent = messageContent;

      if (selectedElement) {
        logger.debug('Selected Element:', selectedElement);

        const elementInfo = `<div class=\"__selectedElement__\" data-element='${JSON.stringify(selectedElement)}'>${JSON.stringify(`${selectedElement.displayText}`)}</div>`;
        finalMessageContent = messageContent + elementInfo;
      }

      runAnimation();

      if (!chatStarted) {
        setFakeLoading(true);
        logger.info('New chat flow: chatStarted=false, autoSelectTemplate=', autoSelectTemplate);

        if (autoSelectTemplate) {
          try {
            const { template, title } = await selectStarterTemplate({
              message: finalMessageContent,
              model,
              provider,
            });

            if (template !== 'blank') {
              const temResp = await getTemplates(template, title).catch((e: Error) => {
                if (e.message.includes('rate limit')) {
                  toast.warning('Rate limit exceeded. Skipping starter template\n Continuing with blank template');
                } else {
                  toast.warning('Failed to import starter template\n Continuing with blank template');
                }

                return null;
              });

              if (temResp) {
                const { assistantMessage, userMessage } = temResp;
                const userMessageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;

                /*
                 * Set the first two messages (user question + assistant template) as
                 * conversation history, then append the hidden instruction via
                 * sendMessage. This avoids the setMessages + reload race condition.
                 */
                setMessages([
                  {
                    id: `1-${new Date().getTime()}`,
                    role: 'user',
                    content: userMessageText,
                    parts: createMessageParts(userMessageText, imageDataList),
                  },
                  {
                    id: `2-${new Date().getTime()}`,
                    role: 'assistant',
                    content: assistantMessage,
                  },
                ]);

                const reloadOptions =
                  uploadedFiles.length > 0
                    ? { experimental_attachments: await filesToAttachments(uploadedFiles) }
                    : undefined;

                /*
                 * Brief yield so React can commit the template history.
                 * If it doesn't commit in time, the hidden instruction still
                 * works — just without the template context (graceful fallback).
                 */
                await new Promise((resolve) => setTimeout(resolve, 50));

                try {
                  await append(
                    {
                      role: 'user',
                      content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userMessage}`,
                      annotations: ['hidden'],
                    },
                    reloadOptions,
                  );
                } catch (appendError) {
                  logger.error('Template chat initiation failed:', appendError);
                  toast.error('Failed to start chat. Please try again.');
                }

                setInput('');
                Cookies.remove(PROMPT_COOKIE_KEY);

                setUploadedFiles([]);
                setImageDataList([]);

                resetEnhancer();

                textareaRef.current?.blur();
                setFakeLoading(false);

                return;
              }
            }
          } catch (templateError) {
            logger.error('Auto-select template failed:', templateError);
            toast.warning('Failed to select starter template. Continuing with blank template.');
            setFakeLoading(false);
          }
        }

        /*
         * Use append() instead of setMessages() + reload().
         * setMessages() updates React state asynchronously, so reload() may poll
         * before the v6 SDK sees the new messages ("No messages to reload").
         * append() calls v6 SDK's sendMessage() directly — no race condition.
         */
        const userMessageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;
        const attachmentOptions =
          uploadedFiles.length > 0 ? { experimental_attachments: await filesToAttachments(uploadedFiles) } : undefined;

        logger.info('Non-template path: calling append() with', userMessageText.substring(0, 80) + '...');

        try {
          await append(
            {
              role: 'user',
              content: userMessageText,
              parts: createMessageParts(userMessageText, imageDataList),
            },
            attachmentOptions,
          );
          logger.info('Non-template path: append() completed successfully');
        } catch (appendError) {
          logger.error('Chat initiation failed:', appendError);
          logger.error('Chat initiation error details:', {
            name: (appendError as Error)?.name,
            message: (appendError as Error)?.message,
            stack: (appendError as Error)?.stack?.substring(0, 300),
          });
          toast.error('Failed to start chat. Please try again.');
        }

        setFakeLoading(false);
        setInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);

        setUploadedFiles([]);
        setImageDataList([]);

        resetEnhancer();

        textareaRef.current?.blur();

        return;
      }

      if (error != null) {
        setMessages(messages.slice(0, -1));
      }

      const modifiedFiles = workbenchStore.getModifiedFiles();

      chatStore.setKey('aborted', false);

      if (modifiedFiles !== undefined) {
        const userUpdateArtifact = filesToArtifacts(modifiedFiles, `${Date.now()}`);
        const messageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userUpdateArtifact}${finalMessageContent}`;

        const attachmentOptions =
          uploadedFiles.length > 0 ? { experimental_attachments: await filesToAttachments(uploadedFiles) } : undefined;

        try {
          await append(
            {
              role: 'user',
              content: messageText,
              parts: createMessageParts(messageText, imageDataList),
            },
            attachmentOptions,
          );

          // Only clear modifications after successful append
          workbenchStore.resetAllFileModifications();
        } catch (appendError) {
          logger.error('Append with modifications failed:', appendError);
          toast.error('Failed to send message. Your file modifications have been preserved.');

          return;
        }
      } else {
        const messageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;

        const attachmentOptions =
          uploadedFiles.length > 0 ? { experimental_attachments: await filesToAttachments(uploadedFiles) } : undefined;

        try {
          await append(
            {
              role: 'user',
              content: messageText,
              parts: createMessageParts(messageText, imageDataList),
            },
            attachmentOptions,
          );
        } catch (appendError) {
          logger.error('Append failed:', appendError);
          toast.error('Failed to send message. Please try again.');

          return;
        }
      }

      // Only clear state after successful send
      setInput('');
      Cookies.remove(PROMPT_COOKIE_KEY);

      setUploadedFiles([]);
      setImageDataList([]);

      resetEnhancer();

      textareaRef.current?.blur();
    } finally {
      sendingRef.current = false;
    }
  };

  return { sendMessage };
}
