/**
 * Agent Orchestrator — Multi-Agent Coordination for Complex Tasks
 * ================================================================
 * Orchestrates multiple specialized AI agents for complex code
 * generation tasks. Decomposes a plan into parallel workstreams,
 * assigns them to specialized agents, and merges results.
 *
 * Agent Types:
 * - Planner: Produces architecture and task decomposition
 * - Coder: Writes implementation code for a specific component
 * - Reviewer: Reviews generated code for quality and correctness
 * - Tester: Generates and runs tests for the implementation
 *
 * The orchestrator manages agent lifecycle, handles dependencies
 * between components, and resolves conflicts when multiple agents
 * modify related code.
 */

import { generateText, type Message } from 'ai';
import type { IProviderSetting } from '~/types/model';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';
import { LLMManager } from '~/lib/modules/llm/manager';
import { createScopedLogger } from '~/utils/logger';
import { extractPropertiesFromMessage } from './utils';
import type { FileMap } from './constants';
import type { ImplementationPlan, PlanStep } from './planning-agent';

const logger = createScopedLogger('agent-orchestrator');

export type AgentRole = 'planner' | 'coder' | 'reviewer' | 'tester';

export interface AgentTask {
  id: string;
  role: AgentRole;
  description: string;

  /** Plan steps assigned to this agent */
  steps: PlanStep[];

  /** Files this agent is responsible for */
  targetFiles: string[];

  /** Context files this agent needs to read */
  contextFiles: string[];

  /** Dependencies — other task IDs that must complete first */
  dependsOn: string[];

  /** Status */
  status: 'pending' | 'running' | 'completed' | 'failed';

  /** Result from the agent */
  result?: AgentResult;
}

export interface AgentResult {
  /** Generated code/content */
  output: string;

  /** Files created or modified */
  filesAffected: string[];

  /** Token usage */
  tokensUsed: number;

  /** Issues found (for reviewer/tester) */
  issues?: string[];

  /** Test results (for tester) */
  testResults?: { passed: number; failed: number; errors: string[] };
}

export interface OrchestrationResult {
  tasks: AgentTask[];
  totalTokensUsed: number;
  completedTasks: number;
  failedTasks: number;
}

/**
 * Role-specific system prompts for each agent type.
 */
const AGENT_PROMPTS: Record<AgentRole, string> = {
  planner: `You are an expert software architect. Your role is to decompose complex requirements into actionable implementation steps. Focus on architecture decisions, dependency ordering, and risk identification.`,

  coder: `You are an expert software engineer. Your role is to write production-quality code for a specific component or feature. Follow the implementation plan precisely. Write clean, well-documented code with proper error handling, types, and edge case coverage. Do NOT skip any requirements.`,

  reviewer: `You are an expert code reviewer. Your role is to review generated code for:
1. Correctness — does it implement the requirements?
2. Quality — is it clean, well-structured, and maintainable?
3. Security — are there any vulnerabilities?
4. Performance — are there any obvious performance issues?
5. Completeness — are there missing edge cases or error handling?

For each issue found, provide:
- Severity: critical | major | minor
- Location: file path and line range
- Description: what's wrong
- Suggestion: how to fix it`,

  tester: `You are an expert test engineer. Your role is to:
1. Generate comprehensive test cases for the implemented code
2. Cover happy paths, edge cases, error scenarios, and boundary conditions
3. Write tests using the project's test framework (Vitest/Jest)
4. Ensure tests are independent and don't have hidden dependencies
5. Focus on behavior verification, not implementation details`,
};

/**
 * Decompose an implementation plan into parallel agent tasks.
 * Groups steps that can be executed independently and creates
 * dependency chains for sequential work.
 */
export function decomposePlan(plan: ImplementationPlan): AgentTask[] {
  const tasks: AgentTask[] = [];

  // Group steps by their dependency level
  const levels = computeDependencyLevels(plan.steps);

  // Create coder tasks for each independent group
  for (const [level, steps] of levels.entries()) {
    // Group steps by target file or component
    const fileGroups = new Map<string, PlanStep[]>();

    for (const step of steps) {
      const key = step.filePath || `group-${step.id}`;
      const existing = fileGroups.get(key) || [];
      existing.push(step);
      fileGroups.set(key, existing);
    }

    for (const [fileKey, groupSteps] of fileGroups) {
      const taskId = `coder-L${level}-${fileKey.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Determine dependencies from prior levels
      const dependsOn: string[] = [];

      for (const step of groupSteps) {
        for (const dep of step.dependencies) {
          // Find which task contains the dependency step
          const depTask = tasks.find((t) => t.steps.some((s) => s.id === dep));

          if (depTask && !dependsOn.includes(depTask.id)) {
            dependsOn.push(depTask.id);
          }
        }
      }

      tasks.push({
        id: taskId,
        role: 'coder',
        description: groupSteps.map((s) => s.description).join('; '),
        steps: groupSteps,
        targetFiles: groupSteps.filter((s) => s.filePath).map((s) => s.filePath!),
        contextFiles: [],
        dependsOn,
        status: 'pending',
      });
    }
  }

  // Add a reviewer task that depends on all coder tasks
  if (tasks.length > 0) {
    tasks.push({
      id: 'reviewer-final',
      role: 'reviewer',
      description: 'Review all generated code for quality, correctness, and completeness',
      steps: [],
      targetFiles: plan.newFiles.concat(plan.modifiedFiles),
      contextFiles: [],
      dependsOn: tasks.map((t) => t.id),
      status: 'pending',
    });

    // Add a tester task that depends on all coder tasks
    tasks.push({
      id: 'tester-final',
      role: 'tester',
      description: 'Generate and validate tests for the implementation',
      steps: [],
      targetFiles: [],
      contextFiles: plan.newFiles.concat(plan.modifiedFiles),
      dependsOn: tasks.filter((t) => t.role === 'coder').map((t) => t.id),
      status: 'pending',
    });
  }

  logger.info(
    `Plan decomposed into ${tasks.length} agent tasks (${tasks.filter((t) => t.role === 'coder').length} coder, 1 reviewer, 1 tester)`,
  );

  return tasks;
}

/**
 * Compute dependency levels for topological ordering.
 * Level 0 = no dependencies, Level 1 = depends on Level 0, etc.
 */
function computeDependencyLevels(steps: PlanStep[]): Map<number, PlanStep[]> {
  const levels = new Map<number, PlanStep[]>();
  const stepLevels = new Map<string, number>();
  const resolved = new Set<string>();

  // First pass: find all steps with no dependencies
  for (const step of steps) {
    if (step.dependencies.length === 0) {
      stepLevels.set(step.id, 0);
      resolved.add(step.id);

      const existing = levels.get(0) || [];
      existing.push(step);
      levels.set(0, existing);
    }
  }

  // Iterative resolution
  let changed = true;
  let iterations = 0;
  const maxIterations = steps.length + 1;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const step of steps) {
      if (resolved.has(step.id)) {
        continue;
      }

      // Check if all dependencies are resolved
      const allDepsResolved = step.dependencies.every((dep) => resolved.has(dep));

      if (allDepsResolved) {
        const depLevel = Math.max(0, ...step.dependencies.map((dep) => stepLevels.get(dep) || 0));
        const level = depLevel + 1;

        stepLevels.set(step.id, level);
        resolved.add(step.id);

        const existing = levels.get(level) || [];
        existing.push(step);
        levels.set(level, existing);

        changed = true;
      }
    }
  }

  // Handle any unresolved steps (circular dependencies) — put them at the end
  for (const step of steps) {
    if (!resolved.has(step.id)) {
      const maxLevel = Math.max(...levels.keys(), 0) + 1;
      const existing = levels.get(maxLevel) || [];
      existing.push(step);
      levels.set(maxLevel, existing);
      logger.warn(`Step ${step.id} has unresolvable dependencies — placed at level ${maxLevel}`);
    }
  }

  return levels;
}

/**
 * Execute a single agent task.
 * Sends the task to the LLM with the appropriate role prompt and returns the result.
 */
export async function executeAgentTask(
  task: AgentTask,
  context: {
    files: FileMap;
    messages: Message[];
    env?: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    completedResults?: Map<string, AgentResult>;
  },
): Promise<AgentResult> {
  const { files, messages, env: serverEnv, apiKeys, providerSettings, completedResults } = context;

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
    modelDetails = modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      throw new Error(
        `Model "${currentModel}" not found for provider "${provider.name}". Please select a valid model.`,
      );
    }
  }

  // Build context from completed tasks
  let priorContext = '';

  if (completedResults && completedResults.size > 0) {
    const relevantResults = task.dependsOn.map((depId) => completedResults.get(depId)).filter(Boolean) as AgentResult[];

    if (relevantResults.length > 0) {
      priorContext = `\n\nPRIOR WORK COMPLETED:\n${relevantResults.map((r) => `Files: ${r.filesAffected.join(', ')}\nOutput summary: ${r.output.slice(0, 500)}...`).join('\n\n')}`;
    }
  }

  // Build file context for target files
  const targetFileContents = task.targetFiles
    .map((path) => {
      const fullPath = path.startsWith('/home/project/') ? path : `/home/project/${path}`;
      const file = files[fullPath];

      if (file && file.type === 'file') {
        return `--- ${path} ---\n${file.content}`;
      }

      return null;
    })
    .filter(Boolean)
    .join('\n\n');

  const systemPrompt = AGENT_PROMPTS[task.role];

  const prompt = `
TASK: ${task.description}

${task.steps.length > 0 ? `IMPLEMENTATION STEPS:\n${task.steps.map((s, i) => `${i + 1}. [${s.type}] ${s.description}${s.filePath ? ` → ${s.filePath}` : ''}`).join('\n')}` : ''}

${targetFileContents ? `CURRENT FILE CONTENTS:\n${targetFileContents}` : ''}

${priorContext}

Execute this task completely. Output all necessary code and changes.
`;

  logger.info(`Executing agent task: ${task.id} (${task.role})`);

  const resp = await generateText({
    system: systemPrompt,
    prompt,
    model: provider.getModelInstance({
      model: currentModel,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
  });

  const tokensUsed = (resp.usage?.inputTokens || 0) + (resp.usage?.outputTokens || 0);

  logger.info(`Agent task ${task.id} completed: ${tokensUsed} tokens`);

  return {
    output: resp.text,
    filesAffected: task.targetFiles,
    tokensUsed,
  };
}

/**
 * Get the tasks that are ready to execute (all dependencies met).
 * Dependencies that have failed are considered resolved — downstream tasks
 * whose dependencies have ALL completed are still ready, but tasks with
 * ANY failed dependency are marked as failed to prevent deadlock.
 */
export function getReadyTasks(tasks: AgentTask[]): AgentTask[] {
  const completedIds = new Set(tasks.filter((t) => t.status === 'completed').map((t) => t.id));
  const failedIds = new Set(tasks.filter((t) => t.status === 'failed').map((t) => t.id));
  const resolvedIds = new Set([...completedIds, ...failedIds]);

  const readyTasks: AgentTask[] = [];

  for (const task of tasks) {
    if (task.status !== 'pending') {
      continue;
    }

    const allDepsResolved = task.dependsOn.every((dep) => resolvedIds.has(dep));

    if (!allDepsResolved) {
      continue;
    }

    // If any dependency failed, cascade the failure
    const hasFailedDep = task.dependsOn.some((dep) => failedIds.has(dep));

    if (hasFailedDep) {
      task.status = 'failed';
    } else {
      readyTasks.push(task);
    }
  }

  return readyTasks;
}

/**
 * Check if orchestration is complete.
 */
export function isOrchestrationComplete(tasks: AgentTask[]): boolean {
  return tasks.every((t) => t.status === 'completed' || t.status === 'failed');
}
