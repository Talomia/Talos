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

  const onData = useCallback(
    (parts: any[]) => {
      setDataState((prev) => [...(prev || []), ...parts]);

      if (options.onFinish && parts.find((p) => p.type === 'finish')) {
        // call onFinish if present
      }
    },
    [options.onFinish],
  );

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

  const isLoading = chat.status === 'submitted' || chat.status === 'streaming';

  const append = useCallback(
    async (message: any, requestOptions?: any): Promise<string | null | undefined> => {
      const text = typeof message.content === 'string' ? message.content : '';
      const res = await chat.sendMessage(
        {
          text,
          metadata: message.annotations,
        },
        requestOptions,
      );

      return res as any;
    },
    [chat],
  );

  const reload = useCallback(
    async (requestOptions?: any): Promise<string | null | undefined> => {
      const res = await chat.regenerate(requestOptions);
      return res as any;
    },
    [chat],
  );

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

  const setMessages = useCallback(
    (value: any) => {
      if (typeof value === 'function') {
        chat.setMessages((prevUIMessages) => {
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
        chat.setMessages(uiMessages);
      }
    },
    [chat],
  );

  const addToolResult = useCallback(
    (args: { toolCallId: string; result: any }) => {
      let toolName = 'unknown';

      for (const msg of chat.messages) {
        if (Array.isArray(msg.parts)) {
          for (const part of msg.parts) {
            if (part.type.startsWith('tool-') && (part as any).toolCallId === args.toolCallId) {
              toolName = part.type.substring(5);
              break;
            }
          }
        }
      }
      chat.addToolResult({
        tool: toolName,
        toolCallId: args.toolCallId,
        state: 'output-available',
        output: args.result,
      });
    },
    [chat],
  );

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
