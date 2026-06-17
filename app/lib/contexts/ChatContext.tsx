import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { JSONValue, Message } from 'ai';
import type { ChatRequestOptions } from '@ai-sdk/ui-utils';
import type { ProviderInfo } from '~/types/model';
import type { ActionAlert, DeployAlert, LlmErrorAlertType, SupabaseAlert } from '~/types/actions';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import type { CreateMessage } from '@ai-sdk/ui-utils';

// --- Sub-object interfaces ---

export interface ChatContextChat {
  messages: Message[];
  input: string;
  chatStarted: boolean;
  isStreaming: boolean;
  data: JSONValue[] | undefined;
  enhancingPrompt: boolean;
}

export interface ChatContextModel {
  model: string;
  setModel: (model: string) => void;
  provider: ProviderInfo;
  setProvider: (provider: ProviderInfo) => void;
  providerList: ProviderInfo[];
}

export interface ChatContextAlerts {
  actionAlert: ActionAlert | undefined;
  clearAlert: () => void;
  supabaseAlert: SupabaseAlert | undefined;
  clearSupabaseAlert: () => void;
  deployAlert: DeployAlert | undefined;
  clearDeployAlert: () => void;
  llmErrorAlert: LlmErrorAlertType | undefined;
  clearLlmErrorAlert: () => void;
}

export interface ChatContextFiles {
  uploadedFiles: File[];
  setUploadedFiles: (files: File[]) => void;
  imageDataList: string[];
  setImageDataList: (dataList: string[]) => void;
}

export interface ChatContextActions {
  sendMessage: (event: React.UIEvent, messageInput?: string) => void;
  handleStop: () => void;
  handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt: () => void;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
}

export interface ChatContextUI {
  showChat: boolean;
  chatMode: 'discuss' | 'build';
  setChatMode: (mode: 'discuss' | 'build') => void;
  designScheme: DesignScheme;
  setDesignScheme: (scheme: DesignScheme) => void;
  selectedElement: ElementInfo | null;
  setSelectedElement: (element: ElementInfo | null) => void;
  onStreamingChange: (streaming: boolean) => void;
}

export interface ChatContextAiSdk {
  // Using `any` for result to match the upstream @ai-sdk/react addToolResult signature exactly

  append: (
    message: Message | CreateMessage,
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;

  addToolResult: (args: { toolCallId: string; result: any }) => void;
  onWebSearchResult: (result: string) => void;
}

export interface ChatContextRefs {
  textareaRef: React.RefObject<HTMLTextAreaElement> | undefined;
}

// --- Top-level context value ---

export interface ChatContextValue {
  chat: ChatContextChat;
  model: ChatContextModel;
  alerts: ChatContextAlerts;
  files: ChatContextFiles;
  actions: ChatContextActions;
  ui: ChatContextUI;
  aiSdk: ChatContextAiSdk;
  refs: ChatContextRefs;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// --- Provider ---

interface ChatContextProviderProps {
  value: ChatContextValue;
  children: ReactNode;
}

export function ChatContextProvider({ value, children }: ChatContextProviderProps) {
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// --- Main hook ---

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);

  if (!ctx) {
    throw new Error('useChatContext must be used within a <ChatContextProvider>');
  }

  return ctx;
}

// --- Convenience sub-hooks ---

export function useChatChat(): ChatContextChat {
  return useChatContext().chat;
}

export function useChatModel(): ChatContextModel {
  return useChatContext().model;
}

export function useChatAlerts(): ChatContextAlerts {
  return useChatContext().alerts;
}

export function useChatFiles(): ChatContextFiles {
  return useChatContext().files;
}

export function useChatActions(): ChatContextActions {
  return useChatContext().actions;
}

export function useChatUI(): ChatContextUI {
  return useChatContext().ui;
}

export function useChatAiSdk(): ChatContextAiSdk {
  return useChatContext().aiSdk;
}

export function useChatRefs(): ChatContextRefs {
  return useChatContext().refs;
}

// --- Helper hook to build a memoized ChatContextValue from raw values ---

export function useChatContextValue(params: {
  chat: ChatContextChat;
  model: ChatContextModel;
  alerts: ChatContextAlerts;
  files: ChatContextFiles;
  actions: ChatContextActions;
  ui: ChatContextUI;
  aiSdk: ChatContextAiSdk;
  refs: ChatContextRefs;
}): ChatContextValue {
  const {
    chat: chatParams,
    model: modelParams,
    alerts: alertsParams,
    files: filesParams,
    actions: actionsParams,
    ui: uiParams,
    aiSdk: aiSdkParams,
    refs: refsParams,
  } = params;

  const chat = useMemo<ChatContextChat>(
    () => ({
      messages: chatParams.messages,
      input: chatParams.input,
      chatStarted: chatParams.chatStarted,
      isStreaming: chatParams.isStreaming,
      data: chatParams.data,
      enhancingPrompt: chatParams.enhancingPrompt,
    }),
    [
      chatParams.messages,
      chatParams.input,
      chatParams.chatStarted,
      chatParams.isStreaming,
      chatParams.data,
      chatParams.enhancingPrompt,
    ],
  );

  const model = useMemo<ChatContextModel>(
    () => ({
      model: modelParams.model,
      setModel: modelParams.setModel,
      provider: modelParams.provider,
      setProvider: modelParams.setProvider,
      providerList: modelParams.providerList,
    }),
    [modelParams.model, modelParams.setModel, modelParams.provider, modelParams.setProvider, modelParams.providerList],
  );

  const alerts = useMemo<ChatContextAlerts>(
    () => ({
      actionAlert: alertsParams.actionAlert,
      clearAlert: alertsParams.clearAlert,
      supabaseAlert: alertsParams.supabaseAlert,
      clearSupabaseAlert: alertsParams.clearSupabaseAlert,
      deployAlert: alertsParams.deployAlert,
      clearDeployAlert: alertsParams.clearDeployAlert,
      llmErrorAlert: alertsParams.llmErrorAlert,
      clearLlmErrorAlert: alertsParams.clearLlmErrorAlert,
    }),
    [
      alertsParams.actionAlert,
      alertsParams.clearAlert,
      alertsParams.supabaseAlert,
      alertsParams.clearSupabaseAlert,
      alertsParams.deployAlert,
      alertsParams.clearDeployAlert,
      alertsParams.llmErrorAlert,
      alertsParams.clearLlmErrorAlert,
    ],
  );

  const files = useMemo<ChatContextFiles>(
    () => ({
      uploadedFiles: filesParams.uploadedFiles,
      setUploadedFiles: filesParams.setUploadedFiles,
      imageDataList: filesParams.imageDataList,
      setImageDataList: filesParams.setImageDataList,
    }),
    [filesParams.uploadedFiles, filesParams.setUploadedFiles, filesParams.imageDataList, filesParams.setImageDataList],
  );

  const actions = useMemo<ChatContextActions>(
    () => ({
      sendMessage: actionsParams.sendMessage,
      handleStop: actionsParams.handleStop,
      handleInputChange: actionsParams.handleInputChange,
      enhancePrompt: actionsParams.enhancePrompt,
      importChat: actionsParams.importChat,
      exportChat: actionsParams.exportChat,
    }),
    [
      actionsParams.sendMessage,
      actionsParams.handleStop,
      actionsParams.handleInputChange,
      actionsParams.enhancePrompt,
      actionsParams.importChat,
      actionsParams.exportChat,
    ],
  );

  const ui = useMemo<ChatContextUI>(
    () => ({
      showChat: uiParams.showChat,
      chatMode: uiParams.chatMode,
      setChatMode: uiParams.setChatMode,
      designScheme: uiParams.designScheme,
      setDesignScheme: uiParams.setDesignScheme,
      selectedElement: uiParams.selectedElement,
      setSelectedElement: uiParams.setSelectedElement,
      onStreamingChange: uiParams.onStreamingChange,
    }),
    [
      uiParams.showChat,
      uiParams.chatMode,
      uiParams.setChatMode,
      uiParams.designScheme,
      uiParams.setDesignScheme,
      uiParams.selectedElement,
      uiParams.setSelectedElement,
      uiParams.onStreamingChange,
    ],
  );

  const aiSdk = useMemo<ChatContextAiSdk>(
    () => ({
      append: aiSdkParams.append,
      addToolResult: aiSdkParams.addToolResult,
      onWebSearchResult: aiSdkParams.onWebSearchResult,
    }),
    [aiSdkParams.append, aiSdkParams.addToolResult, aiSdkParams.onWebSearchResult],
  );

  const refs = useMemo<ChatContextRefs>(
    () => ({
      textareaRef: refsParams.textareaRef,
    }),
    [refsParams.textareaRef],
  );

  return useMemo<ChatContextValue>(
    () => ({ chat, model, alerts, files, actions, ui, aiSdk, refs }),
    [chat, model, alerts, files, actions, ui, aiSdk, refs],
  );
}
