import 'ai';

declare module 'ai' {
  export type Message = import('@ai-sdk/ui-utils').Message;
  export type DataStreamWriter = import('@ai-sdk/ui-utils').DataStreamWriter;

  export type LanguageModelV1 = any;
  export type CoreTool<PARAMETERS = any, RESULT = any> = import('ai').Tool<PARAMETERS, RESULT>;
}

