/**
 * Planning Agent — Structured Planning Phase for Code Generation
 * ==============================================================
 * Forces a planning phase before code generation. The AI produces
 * a structured implementation plan (architecture, file list,
 * implementation order, dependencies) which is validated and
 * decomposed into ordered tasks before execution begins.
 */

import { generateText, type Message } from 'ai';
import type { IProviderSetting } from '~/types/model';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';
import { LLMManager } from '~/lib/modules/llm/manager';
import { createScopedLogger } from '~/utils/logger';
import { extractPropertiesFromMessage, createFilesContext } from './utils';
import type { FileMap } from './constants';

const logger = createScopedLogger('planning-agent');

export interface PlanStep {
  id: string;
  type: 'file-create' | 'file-modify' | 'shell-command' | 'dependency-install' | 'config-update' | 'verification';
  description: string;
  filePath?: string;
  dependencies: string[]; // IDs of steps that must complete first
  estimatedTokens: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface ImplementationPlan {
  /** High-level summary of the approach */
  summary: string;

  /** Architecture decisions and rationale */
  architecture: string;

  /** Technology choices with justification */
  techStack: string[];

  /** Ordered list of implementation steps */
  steps: PlanStep[];

  /** Files that will be created */
  newFiles: string[];

  /** Files that will be modified */
  modifiedFiles: string[];

  /** Dependencies to install */
  dependencies: string[];

  /** Estimated total tokens for implementation */
  estimatedTotalTokens: number;

  /** Risk factors and mitigations */
  risks: string[];
}

export interface PlanningResult {
  plan: ImplementationPlan;
  planningTokensUsed: number;
  planText: string;
}

const PLANNING_SYSTEM_PROMPT = `You are an expert software architect. Your job is to create a structured implementation plan before any code is written.

Given a user's request and the current project context, produce a comprehensive plan in the following XML format:

<implementation_plan>
  <summary>High-level description of what will be built</summary>
  <architecture>Key architectural decisions and patterns to use</architecture>
  <tech_stack>
    <technology>Technology name and why it's chosen</technology>
  </tech_stack>
  <steps>
    <step id="1" type="dependency-install" priority="critical">
      <description>What this step does</description>
      <file_path>path/to/file (if applicable)</file_path>
      <depends_on></depends_on>
      <estimated_tokens>500</estimated_tokens>
    </step>
    <step id="2" type="file-create" priority="critical">
      <description>What this step does</description>
      <file_path>src/components/App.tsx</file_path>
      <depends_on>1</depends_on>
      <estimated_tokens>2000</estimated_tokens>
    </step>
  </steps>
  <new_files>
    <file>path/to/new/file</file>
  </new_files>
  <modified_files>
    <file>path/to/existing/file</file>
  </modified_files>
  <dependencies>
    <package>package-name</package>
  </dependencies>
  <risks>
    <risk>Potential issue and how to mitigate it</risk>
  </risks>
</implementation_plan>

RULES:
1. Order steps by dependency — foundational work first (configs, dependencies), then core logic, then UI, then polish
2. Estimate tokens accurately — a typical component file is 1000-3000 tokens
3. Mark steps that can be parallelized (no dependencies between them) with the same depends_on
4. Always include a verification step at the end
5. Consider error handling, edge cases, accessibility, and responsive design
6. If the project already has files, plan modifications carefully to maintain consistency
7. Step types: file-create, file-modify, shell-command, dependency-install, config-update, verification
8. Priority levels: critical (app won't work without it), high (core functionality), medium (important feature), low (polish/optimization)
`;

/**
 * Generate a structured implementation plan before code generation.
 */
export async function generatePlan(props: {
  messages: Message[];
  files: FileMap;
  env?: Env;
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
  summary?: string;
  contextFiles?: FileMap;
}): Promise<PlanningResult> {
  const { messages, files, env: serverEnv, apiKeys, providerSettings, summary, contextFiles } = props;

  // Extract model/provider from the last user message
  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

  if (lastUserMessage) {
    const { model, provider } = extractPropertiesFromMessage(lastUserMessage);
    currentModel = model;
    currentProvider = provider;
  }

  const provider = PROVIDER_LIST.find((p) => p.name === currentProvider) || DEFAULT_PROVIDER;
  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);
  let modelDetails = staticModels.find((m) => m.name === currentModel);

  if (!modelDetails) {
    const modelsList = [
      ...(provider.staticModels || []),
      ...(await LLMManager.getInstance().getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv,
      })),
    ];

    modelDetails = modelsList.find((m) => m.name === currentModel) || modelsList[0];
  }

  // Build context from existing files
  const fileList = Object.keys(files || {})
    .map((p) => p.replace('/home/project/', ''))
    .filter((p) => !p.includes('node_modules') && !p.includes('.git'));

  const contextStr = contextFiles ? createFilesContext(contextFiles, true) : '';

  const userContent =
    lastUserMessage && typeof lastUserMessage.content === 'string'
      ? lastUserMessage.content
      : lastUserMessage
        ? Array.isArray(lastUserMessage.content)
          ? (lastUserMessage.content as any[])
              .filter((p: any) => p.type === 'text')
              .map((p: any) => p.text)
              .join('')
          : ''
        : '';

  logger.info(`Generating implementation plan for: ${userContent.slice(0, 100)}...`);

  const resp = await generateText({
    system: PLANNING_SYSTEM_PROMPT,
    prompt: `
${summary ? `CONVERSATION SUMMARY:\n${summary}\n\n` : ''}
EXISTING PROJECT FILES:
${fileList.length > 0 ? fileList.map((f) => `- ${f}`).join('\n') : '(Empty project — starting from scratch)'}

${contextStr ? `\nCURRENT FILE CONTENTS:\n${contextStr}\n` : ''}

USER REQUEST:
${userContent}

Create a comprehensive implementation plan. Think step-by-step about architecture, dependencies, file structure, and implementation order. Be thorough — this plan will guide the entire implementation.
`,
    model: provider.getModelInstance({
      model: currentModel,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
  });

  const planText = resp.text;
  const plan = parsePlanXML(planText);

  const tokensUsed = (resp.usage?.inputTokens || 0) + (resp.usage?.outputTokens || 0);

  logger.info(
    `Plan generated: ${plan.steps.length} steps, ${plan.newFiles.length} new files, ${plan.modifiedFiles.length} modified files, ${tokensUsed} tokens used`,
  );

  return {
    plan,
    planningTokensUsed: tokensUsed,
    planText,
  };
}

/**
 * Convert the plan into a structured prompt injection that guides the AI's code generation.
 */
export function planToPromptContext(plan: ImplementationPlan): string {
  const stepList = plan.steps
    .map(
      (s, i) =>
        `${i + 1}. [${s.priority.toUpperCase()}] ${s.type}: ${s.description}${s.filePath ? ` (${s.filePath})` : ''}${s.dependencies.length > 0 ? ` [depends on: ${s.dependencies.join(', ')}]` : ''}`,
    )
    .join('\n');

  return `
<implementation_plan_context>
You MUST follow this implementation plan. Execute each step in order, respecting dependencies.

SUMMARY: ${plan.summary}

ARCHITECTURE: ${plan.architecture}

TECH STACK: ${plan.techStack.join(', ')}

IMPLEMENTATION STEPS (execute in this order):
${stepList}

NEW FILES TO CREATE: ${plan.newFiles.join(', ')}
FILES TO MODIFY: ${plan.modifiedFiles.join(', ')}
DEPENDENCIES TO INSTALL: ${plan.dependencies.join(', ')}

RISKS TO MITIGATE:
${plan.risks.map((r) => `- ${r}`).join('\n')}

CRITICAL RULES:
- Complete ALL steps. Do not skip any step.
- Install dependencies BEFORE writing code that uses them.
- Create config files BEFORE component files.
- Test your work mentally at each step — would this actually compile and run?
- If a step seems wrong, note why and adapt, but still cover the intent.
</implementation_plan_context>
`;
}

/**
 * Parse the XML plan response into a structured object.
 */
function parsePlanXML(xml: string): ImplementationPlan {
  const plan: ImplementationPlan = {
    summary: '',
    architecture: '',
    techStack: [],
    steps: [],
    newFiles: [],
    modifiedFiles: [],
    dependencies: [],
    estimatedTotalTokens: 0,
    risks: [],
  };

  // Extract summary
  const summaryMatch = xml.match(/<summary>([\s\S]*?)<\/summary>/);
  plan.summary = summaryMatch?.[1]?.trim() || 'Implementation plan';

  // Extract architecture
  const archMatch = xml.match(/<architecture>([\s\S]*?)<\/architecture>/);
  plan.architecture = archMatch?.[1]?.trim() || '';

  // Extract tech stack
  const techMatches = xml.matchAll(/<technology>([\s\S]*?)<\/technology>/g);

  for (const match of techMatches) {
    plan.techStack.push(match[1].trim());
  }

  // Extract steps
  const stepMatches = xml.matchAll(/<step\s+id="([^"]*?)"\s+type="([^"]*?)"\s+priority="([^"]*?)">([\s\S]*?)<\/step>/g);

  for (const match of stepMatches) {
    const stepContent = match[4];
    const descMatch = stepContent.match(/<description>([\s\S]*?)<\/description>/);
    const fileMatch = stepContent.match(/<file_path>([\s\S]*?)<\/file_path>/);
    const depsMatch = stepContent.match(/<depends_on>([\s\S]*?)<\/depends_on>/);
    const tokensMatch = stepContent.match(/<estimated_tokens>([\s\S]*?)<\/estimated_tokens>/);

    const deps = depsMatch?.[1]?.trim()
      ? depsMatch[1]
          .trim()
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
      : [];

    const estimatedTokens = parseInt(tokensMatch?.[1]?.trim() || '1000', 10);

    plan.steps.push({
      id: match[1],
      type: match[2] as PlanStep['type'],
      priority: match[3] as PlanStep['priority'],
      description: descMatch?.[1]?.trim() || '',
      filePath: fileMatch?.[1]?.trim() || undefined,
      dependencies: deps,
      estimatedTokens,
    });

    plan.estimatedTotalTokens += estimatedTokens;
  }

  // Extract new files
  const newFileMatches = xml.match(/<new_files>([\s\S]*?)<\/new_files>/);

  if (newFileMatches) {
    const fileEntries = newFileMatches[1].matchAll(/<file>([\s\S]*?)<\/file>/g);

    for (const entry of fileEntries) {
      plan.newFiles.push(entry[1].trim());
    }
  }

  // Extract modified files
  const modFileMatches = xml.match(/<modified_files>([\s\S]*?)<\/modified_files>/);

  if (modFileMatches) {
    const fileEntries = modFileMatches[1].matchAll(/<file>([\s\S]*?)<\/file>/g);

    for (const entry of fileEntries) {
      plan.modifiedFiles.push(entry[1].trim());
    }
  }

  // Extract dependencies
  const depMatches = xml.match(/<dependencies>([\s\S]*?)<\/dependencies>/);

  if (depMatches) {
    const pkgEntries = depMatches[1].matchAll(/<package>([\s\S]*?)<\/package>/g);

    for (const entry of pkgEntries) {
      plan.dependencies.push(entry[1].trim());
    }
  }

  // Extract risks
  const riskMatches = xml.match(/<risks>([\s\S]*?)<\/risks>/);

  if (riskMatches) {
    const riskEntries = riskMatches[1].matchAll(/<risk>([\s\S]*?)<\/risk>/g);

    for (const entry of riskEntries) {
      plan.risks.push(entry[1].trim());
    }
  }

  // If parsing found no steps, create a fallback single-step plan
  if (plan.steps.length === 0) {
    logger.warn('Plan XML parsing found no steps — creating fallback plan');
    plan.steps.push({
      id: '1',
      type: 'file-create',
      description: plan.summary || 'Implement the requested feature',
      priority: 'critical',
      dependencies: [],
      estimatedTokens: 8000,
    });
    plan.estimatedTotalTokens = 8000;
  }

  return plan;
}
