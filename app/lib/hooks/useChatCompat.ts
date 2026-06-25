import { useState, useCallback, useRef } from 'react';
import { useChat as useChatV6 } from '@ai-sdk/react';
import { DefaultChatTransport, generateId } from 'ai';

interface UseChatOptions {
  api?: string;
  body?: Record<string, any> | (() => Record<string, any>);
  headers?: Record<string, string> | (() => Record<string, string>);
  id?: string;
  initialMessages?: any[];
  onResponse?: (response: Response) => void | Promise<void>;
  onFinish?: (message: any, options: { usage?: any }) => void | Promise<void>;
  onError?: (error: Error) => void;
  sendExtraMessageFields?: boolean;
  initialInput?: string;
}

export function useChat(options: UseChatOptions = {}) {
  const [data, setDataState] = useState<any[] | undefined>(undefined);
  const [input, setInput] = useState(options.initialInput || '');

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    setInput(e.target.value);
  }, []);

  const setData = useCallback((value: any[] | undefined) => {
    setDataState(value);
  }, []);

  const onData = useCallback((parts: any[]) => {
    setDataState((prev) => [...(prev || []), ...parts]);
  }, []);

  const onFinishRef = useRef(options.onFinish);
  onFinishRef.current = options.onFinish;

  const v6Options: any = {
    initialMessages: options.initialMessages
      ? options.initialMessages.map((m: any) => ({
          id: m.id || generateId(),
          role: m.role,
          parts: [{ type: 'text', text: m.content || '' }],
          metadata: m.annotations,
        }))
      : undefined,
    initialInput: options.initialInput,
    onError: options.onError,
    onData,
    onFinish: ({ message }: { message: any }) => {
      if (!onFinishRef.current) {
        return;
      }

      // Extract usage from message metadata (sent as annotations from the server)
      let usage: any;
      const metadata = message.metadata;

      if (metadata) {
        // metadata could be an object or an array of annotation objects
        const annotations = Array.isArray(metadata) ? metadata : [metadata];

        for (const ann of annotations) {
          if (ann?.type === 'usage' && ann?.value) {
            usage = ann.value;
            break;
          }
        }
      }

      // Build compat message with content extracted from parts
      let content = '';

      if (Array.isArray(message.parts)) {
        for (const part of message.parts) {
          if (part.type === 'text') {
            content += part.text;
          }
        }
      }

      if (!content && typeof message.content === 'string') {
        content = message.content;
      }

      onFinishRef.current({ id: message.id, role: message.role, content }, { usage });
    },
  };

  if (options.id !== undefined) {
    v6Options.id = options.id;
  }

  const api = options.api || '/api/chat';
  const bodyRef = useRef(options.body);
  bodyRef.current = options.body;

  const headersRef = useRef(options.headers);
  headersRef.current = options.headers;

  v6Options.transport = new DefaultChatTransport({
    api,
    body: () => {
      const currentBody = bodyRef.current;
      return typeof currentBody === 'function' ? currentBody() : currentBody || {};
    },
    headers: () => {
      const currentHeaders = headersRef.current;
      return typeof currentHeaders === 'function' ? currentHeaders() : currentHeaders || {};
    },

    /*
     * Convert v6 UIMessages (parts array) → old-style messages (content string)
     * before sending to the server. The server's extractPropertiesFromMessage()
     * and sanitizeText() expect message.content to be a string.
     */
    prepareSendMessagesRequest: ({ messages, body, ...rest }) => {
      const convertedMessages = messages.map((m: any) => {
        let content = '';

        if (Array.isArray(m.parts)) {
          for (const part of m.parts) {
            if (part.type === 'text') {
              content += part.text;
            }
          }
        }

        if (!content && typeof m.content === 'string') {
          content = m.content;
        }

        return {
          id: m.id,
          role: m.role,
          content,
          parts: m.parts, // Keep parts for convertToModelMessages
          annotations: m.metadata,
        };
      });

      return { ...rest, messages: convertedMessages, body: { ...body, messages: convertedMessages } };
    },
  });

  const chat = useChatV6(v6Options);
  const chatRef = useRef(chat);
  chatRef.current = chat;

  const isLoading = chat.status === 'submitted' || chat.status === 'streaming';

  const append = useCallback(async (message: any, requestOptions?: any): Promise<string | null | undefined> => {
    const text = typeof message.content === 'string' ? message.content : '';

    /*
     * Forward image/file parts from the message so they reach the v6 SDK.
     * createMessageParts() creates parts like [{ type:'text' }, { type:'file', ... }].
     */
    const fileParts = Array.isArray(message.parts) ? message.parts.filter((p: any) => p.type === 'file') : [];

    const sendArgs: any = {
      text,
      metadata: message.annotations,
    };

    if (fileParts.length > 0) {
      sendArgs.files = fileParts;
    }

    console.log(
      '[useChatCompat] append: calling sendMessage, text length:',
      text.length,
      'status:',
      chatRef.current.status,
    );

    const res = await chatRef.current.sendMessage(sendArgs, requestOptions);

    console.log('[useChatCompat] append: sendMessage completed, messages count:', chatRef.current.messages.length);

    return res as any;
  }, []);

  const reload = useCallback(async (requestOptions?: any): Promise<string | null | undefined> => {
    /*
     * Yield control to the React commit phase so that setMessages
     * propagates to the v6 SDK's internal state before we act on it.
     */
    for (let i = 0; i < 40; i++) {
      if (chatRef.current.messages.length > 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const msgs = chatRef.current.messages;

    if (msgs.length === 0) {
      throw new Error('No messages to reload');
    }

    const lastMsg = msgs[msgs.length - 1];

    /*
     * v6 SDK semantic difference:
     *   - regenerate() requires the last message to be an assistant message
     *   - In the old SDK, reload() would just re-send the current messages
     *     to get a new response, regardless of who sent the last message.
     *
     * When the last message is a user message (new-chat flow or template flow),
     * we pop it from the internal state and re-send it via sendMessage(), which
     * both adds the user message AND triggers generation.
     */
    if (lastMsg.role === 'user') {
      const textPart = Array.isArray(lastMsg.parts) ? lastMsg.parts.find((p: any) => p.type === 'text') : undefined;
      const text = textPart ? (textPart as any).text || '' : '';
      const metadata = lastMsg.metadata;

      // Remove the last user message — sendMessage will re-add it
      chatRef.current.setMessages(msgs.slice(0, -1));

      // Brief yield to let the state settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      const res = await chatRef.current.sendMessage({ text, metadata }, requestOptions);

      return res as any;
    }

    // Last message is an assistant message — standard regenerate
    const res = await chatRef.current.regenerate(requestOptions);

    return res as any;
  }, []);

  // Map UIMessage[] to Message[]
  const messages = chat.messages.map((m) => {
    let content = '';

    if (Array.isArray(m.parts)) {
      for (const part of m.parts) {
        if (part.type === 'text') {
          content += part.text;
        } else if (part.type === 'reasoning') {
          content += `<div class="__assistantThought__">\n${part.text}\n</div>\n`;
        }
      }
    }

    if (!content && typeof (m as any).content === 'string') {
      content = (m as any).content;
    }

    return {
      id: m.id,
      role: m.role,
      content,
      annotations: m.metadata as any,
      parts: m.parts as any,
      createdAt: (m as any).createdAt,
    };
  });

  const setMessages = useCallback((value: any) => {
    if (typeof value === 'function') {
      chatRef.current.setMessages((prevUIMessages) => {
        const mappedMessages = prevUIMessages.map((m) => {
          let content = '';

          if (Array.isArray(m.parts)) {
            for (const part of m.parts) {
              if (part.type === 'text') {
                content += part.text;
              } else if (part.type === 'reasoning') {
                content += `<div class="__assistantThought__">\n${part.text}\n</div>\n`;
              }
            }
          }

          if (!content && typeof (m as any).content === 'string') {
            content = (m as any).content;
          }

          return {
            id: m.id,
            role: m.role,
            content,
            annotations: m.metadata as any,
            parts: m.parts as any,
            createdAt: (m as any).createdAt,
          };
        });
        const updated = value(mappedMessages);

        return updated.map((msg: any) => ({
          id: msg.id || generateId(),
          role: msg.role,
          parts: Array.isArray(msg.parts) ? msg.parts : [{ type: 'text', text: msg.content || '' }],
          metadata: msg.annotations,
        }));
      });
    } else {
      const uiMessages = value.map((msg: any) => ({
        id: msg.id || generateId(),
        role: msg.role,
        parts: Array.isArray(msg.parts) ? msg.parts : [{ type: 'text', text: msg.content || '' }],
        metadata: msg.annotations,
      }));
      chatRef.current.setMessages(uiMessages);
    }
  }, []);

  const addToolResult = useCallback((args: { toolCallId: string; result: any }) => {
    let toolName = 'unknown';

    for (const msg of chatRef.current.messages) {
      if (Array.isArray(msg.parts)) {
        for (const part of msg.parts) {
          if (part.type === 'tool-invocation' && (part as any).toolInvocation?.toolCallId === args.toolCallId) {
            toolName = (part as any).toolInvocation?.toolName || 'unknown';
            break;
          }
        }
      }
    }

    chatRef.current.addToolResult({
      tool: toolName,
      toolCallId: args.toolCallId,
      state: 'output-available',
      output: args.result,
    });
  }, []);

  console.log('[useChatCompat] render - chat.messages:', chat.messages?.length, 'mapped messages:', messages?.length);

  return {
    ...chat,
    isLoading,
    input,
    setInput,
    handleInputChange,
    append,
    reload,
    messages,
    setMessages,
    addToolResult,
    data,
    setData,
  };
}
