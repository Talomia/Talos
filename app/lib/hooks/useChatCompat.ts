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
    id: options.id,
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

      onFinishRef.current({ id: message.id, role: message.role, content }, { usage });
    },
  };

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
  });

  const chat = useChatV6(v6Options);
  const chatRef = useRef(chat);
  chatRef.current = chat;

  const isLoading = chat.status === 'submitted' || chat.status === 'streaming';

  const append = useCallback(async (message: any, requestOptions?: any): Promise<string | null | undefined> => {
    const text = typeof message.content === 'string' ? message.content : '';
    const res = await chatRef.current.sendMessage(
      {
        text,
        metadata: message.annotations,
      },
      requestOptions,
    );

    return res as any;
  }, []);

  const reload = useCallback(async (requestOptions?: any): Promise<string | null | undefined> => {
    /*
     * Yield control to the React commit phase to let the state update propagate.
     * We poll chatRef.current.messages until it is not empty, for up to 200ms.
     */
    for (let i = 0; i < 20; i++) {
      if (chatRef.current.messages.length > 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

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

    return {
      id: m.id,
      role: m.role,
      content,
      annotations: m.metadata as any,
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

          return { id: m.id, role: m.role, content, annotations: m.metadata as any };
        });
        const updated = value(mappedMessages);

        return updated.map((msg: any) => ({
          id: msg.id || generateId(),
          role: msg.role,
          parts: [{ type: 'text', text: msg.content }],
          metadata: msg.annotations,
        }));
      });
    } else {
      const uiMessages = value.map((msg: any) => ({
        id: msg.id || generateId(),
        role: msg.role,
        parts: [{ type: 'text', text: msg.content }],
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
          if (part.type.startsWith('tool-') && (part as any).toolCallId === args.toolCallId) {
            toolName = part.type.substring(5);
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
