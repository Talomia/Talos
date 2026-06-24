import { type Message } from 'ai';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODEL_REGEX, PROVIDER_REGEX } from '~/utils/constants';
import { IGNORE_PATTERNS, type FileMap } from './constants';
import ignore from 'ignore';
import type { ContextAnnotation } from '~/types/context';
import { ARTIFACT_TAG_OPEN, ARTIFACT_TAG_CLOSE, ACTION_TAG_OPEN, ACTION_TAG_CLOSE } from '~/lib/app-config';

export function extractPropertiesFromMessage(message: Omit<Message, 'id'>): {
  model: string;
  provider: string;
  content: string;
} {
  /*
   * Defensive: support both old-style messages (content: string) and
   * v6 UIMessages (parts: Array<{ type: 'text', text: string }>).
   * The transport layer converts UIMessages to old format, but this fallback
   * provides defense-in-depth if messages arrive in raw UIMessage format.
   */
  let textContent: string;

  if (typeof message.content === 'string' && message.content) {
    textContent = message.content;
  } else if (Array.isArray((message as any).parts)) {
    textContent =
      (message as any).parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text || '')
        .join('') || '';
  } else {
    textContent = message.content || '';
  }

  const modelMatch = textContent.match(MODEL_REGEX);
  const providerMatch = textContent.match(PROVIDER_REGEX);

  /*
   * Extract model
   * const modelMatch = message.content.match(MODEL_REGEX);
   */
  const model = modelMatch ? modelMatch[1] : DEFAULT_MODEL;

  /*
   * Extract provider
   * const providerMatch = message.content.match(PROVIDER_REGEX);
   */
  const provider = providerMatch ? providerMatch[1] : DEFAULT_PROVIDER.name;

  const cleanedContent = textContent.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, '');

  return { model, provider, content: cleanedContent };
}

export function simplifyActions(input: string): string {
  // Using regex to match action tags that have type="file" (both new and legacy)
  const regex = new RegExp(`((?:${ACTION_TAG_OPEN})[^>]*type="file"[^>]*>)([\\s\\S]*?)((?:${ACTION_TAG_CLOSE}))`, 'g');

  // Replace each matching occurrence
  return input.replace(regex, (_0, openingTag, _2, closingTag) => {
    return `${openingTag}\n          ...\n        ${closingTag}`;
  });
}

export function createFilesContext(files: FileMap, useRelativePath?: boolean) {
  const ig = ignore().add(IGNORE_PATTERNS);
  let filePaths = Object.keys(files);
  filePaths = filePaths.filter((x) => {
    const relPath = x.replace('/home/project/', '');
    return !ig.ignores(relPath);
  });

  const fileContexts = filePaths
    .filter((x) => files[x] && files[x].type === 'file')
    .map((path) => {
      const dirent = files[path];

      if (!dirent || dirent.type === 'folder') {
        return '';
      }

      const codeWithLinesNumbers = dirent.content
        .split('\n')
        // .map((v, i) => `${i + 1}|${v}`)
        .join('\n');

      let filePath = path;

      if (useRelativePath) {
        filePath = path.replace('/home/project/', '');
      }

      return `${ACTION_TAG_OPEN} type="file" filePath="${filePath}">${codeWithLinesNumbers}${ACTION_TAG_CLOSE}`;
    });

  return `${ARTIFACT_TAG_OPEN} id="code-content" title="Code Content" >\n${fileContexts.join('\n')}\n${ARTIFACT_TAG_CLOSE}`;
}

export function extractCurrentContext(messages: Message[]) {
  const lastAssistantMessage = messages.filter((x) => x.role === 'assistant').slice(-1)[0];

  if (!lastAssistantMessage) {
    return { summary: undefined, codeContext: undefined };
  }

  let summary: ContextAnnotation | undefined;
  let codeContext: ContextAnnotation | undefined;

  if (!lastAssistantMessage.annotations?.length) {
    return { summary: undefined, codeContext: undefined };
  }

  for (let i = 0; i < lastAssistantMessage.annotations.length; i++) {
    const annotation = lastAssistantMessage.annotations[i];

    if (!annotation || typeof annotation !== 'object') {
      continue;
    }

    if (!(annotation as Record<string, unknown>).type) {
      continue;
    }

    const annotationObject = annotation as Record<string, unknown>;

    if (annotationObject.type === 'codeContext') {
      codeContext = annotationObject as unknown as ContextAnnotation;
    } else if (annotationObject.type === 'chatSummary') {
      summary = annotationObject as unknown as ContextAnnotation;
    }
  }

  return { summary, codeContext };
}
