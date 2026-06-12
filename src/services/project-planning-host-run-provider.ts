/**
 * @module app:services/project-planning-host-run-provider
 * 职责：提供应用运行时 service 层的 project planning host run provider 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * APP 壳层 projectPlanning Host Run provider（隔离式门面实例）。
 *
 * 无 UI：SSE / 后端下发 ai-host-run-request 时，按 projectId 准备 headless
 * ProjectWorkspace，运行结束可选保存 navigation 后丢弃，不污染 DevSystem session。
 */

import {
  createAiAgentHost,
  type AiAgentHost,
  type AiAgentHostRunResult,
  type AiAgentTaskChatOptions,
} from '@spark-appworks/spark-ai/agent'
import type { AiJsonParams } from '@spark-appworks/spark-ai/json'
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type {
  AiHostRunPrepare,
  AiHostRunTarget,
} from '@/services/ai-host-run-bridge'
import { createAiAgentTurnCallbacks } from '@/services/ai-turn-bridge'
import { createHeadlessProjectPlanningEditor } from '@/services/project-planning-editor-provider'
import {
  buildProjectPlanningAgentInput,
  ensureProjectPlanningBusiness,
  PROJECT_PLANNING_MODULE_ID,
} from '@/services/project-planning-business'
import {
  attachAiDeliveryResult,
  createAiDeliveryFailureError,
  createAiDeliveryResultExtras,
  toError,
} from '@/services/ai-delivery-port'
import { createProjectPlanningHostRunDeliveryPort } from '@/services/project-planning-delivery-port'

type ProjectPlanningHostRunScope = Readonly<{
  tenantId: string
  projectId: string
  scopeKey: string
  agentScopeKey: string
  saveNavigationAfterRun: boolean
}>

export const prepareProjectPlanningHostRun: AiHostRunPrepare<AiAgentHost> = async (event, bridgeHost) => {
  if (event.alias !== PROJECT_PLANNING_MODULE_ID) return bridgeHost

  const scope = readProjectPlanningHostRunScope(event.args, event.requestId)
  const editor = createHeadlessProjectPlanningEditor({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
  })
  await editor.loadNavigation()

  // 每次 Host Run 使用独立 AiAgentHost + 闭包 getter，避免 appAiAgent.ensure 幂等
  // 或模块级 registry 在 HMR / 并发同 scope 时丢失 editor。
  const runHost = createAiAgentHost({
    turnCallbacks: createAiAgentTurnCallbacks({ transport: 'app-sse' }),
    maxToolRounds: 16,
  })
  const projectPlanningHost = ensureProjectPlanningBusiness({
    host: runHost,
    getProjectPlanningEditor: () => editor,
  })

  return createScopedProjectPlanningHost(projectPlanningHost, scope, editor)
}

function createScopedProjectPlanningHost(
  host: AiHostRunTarget,
  scope: ProjectPlanningHostRunScope,
  editor: ProjectWorkspace,
): AiHostRunTarget {
  const delivery = createProjectPlanningHostRunDeliveryPort()
  return {
    has(alias) {
      return host.has(alias)
    },
    dryRun(alias, args) {
      if (alias !== PROJECT_PLANNING_MODULE_ID) return host.dryRun(alias, args)
      return host.dryRun(alias, normalizeProjectPlanningHostRunInput(args, scope, editor))
    },
    async run(
      alias: string,
      args: AiJsonParams,
      chat?: AiAgentTaskChatOptions,
    ): Promise<AiAgentHostRunResult> {
      const normalizedInput = alias === PROJECT_PLANNING_MODULE_ID
        ? normalizeProjectPlanningHostRunInput(args, scope, editor)
        : args
      let result: AiAgentHostRunResult
      try {
        result = await host.run(alias, normalizedInput, chat)
      } catch (error: unknown) {
        const normalizedError = toError(error)
        const deliveryContext = {
          editor,
          saveNavigationAfterRun: scope.saveNavigationAfterRun,
        }
        const deliveryResult = await delivery.rollback(deliveryContext, normalizedError)
        await delivery.trace(deliveryContext, deliveryResult)
        throw attachAiDeliveryResult(normalizedError, deliveryResult)
      }

      const deliveryContext = {
        editor,
        saveNavigationAfterRun: scope.saveNavigationAfterRun,
      }
      const deliveryResult = await delivery.save(deliveryContext)
      await delivery.trace(deliveryContext, deliveryResult)
      if (deliveryResult.status === 'failed') {
        throw createAiDeliveryFailureError(
          deliveryResult.message ?? 'projectPlanning Host Run delivery failed.',
          deliveryResult,
        )
      }
      return {
        ...result,
        resultExtras: {
          ...(result.resultExtras ?? {}),
          ...createAiDeliveryResultExtras(deliveryResult),
          projectPlanning: {
            tenantId: scope.tenantId,
            projectId: scope.projectId,
            projectScopeKey: scope.scopeKey,
            agentScopeKey: scope.agentScopeKey,
            navigationDirty: editor.project.navigationDirty,
            savedNavigation: deliveryResult.status === 'saved',
            navigationRoot: editor.project.navigationRoot,
          },
        },
      }
    },
  }
}

function normalizeProjectPlanningHostRunInput(
  args: unknown,
  scope: ProjectPlanningHostRunScope,
  editor: ProjectWorkspace,
): AiJsonParams {
  if (!isJsonObjectRecord(args)) {
    throw new Error('projectPlanning Host Run args must be a JSON object.')
  }
  const record = args
  const requirementOverride = readOptionalString(record, 'requirement')
  const planningAttachmentText = readOptionalString(record, 'planningAttachmentText')
  const navigationAttachmentTextByNodeId = readOptionalStringRecord(record, 'navigationAttachmentTextByNodeId')
  const scopeNodeIds = readOptionalStringArray(record, 'scopeNodeIds')
  const includeEmptyRequirement = readOptionalBoolean(record, 'includeEmptyRequirement')
  const options = {
    ...(requirementOverride === undefined ? {} : { requirementOverride }),
    ...(planningAttachmentText === undefined ? {} : { planningAttachmentText }),
    ...(navigationAttachmentTextByNodeId === undefined ? {} : { navigationAttachmentTextByNodeId }),
    ...(scopeNodeIds === undefined ? {} : { scopeNodeIds }),
    ...(includeEmptyRequirement === undefined ? {} : { includeEmptyRequirement }),
  }
  return {
    ...buildProjectPlanningAgentInput(editor.project, options),
    projectScopeKey: scope.agentScopeKey,
    projectId: scope.projectId,
  }
}

function isJsonObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readProjectPlanningHostRunScope(
  args: Record<string, unknown>,
  requestId?: string,
): ProjectPlanningHostRunScope {
  const tenantId = readRequiredString(args, 'tenantId')
  const projectId = readRequiredString(args, 'projectId')
  const saveNavigationAfterRun = readOptionalBoolean(args, 'saveNavigationAfterRun') === true
  const scopeKey = `${tenantId}:${projectId}`
  return {
    tenantId,
    projectId,
    scopeKey,
    agentScopeKey: requestId === undefined || requestId.trim().length === 0
      ? scopeKey
      : `${scopeKey}:${requestId.trim()}`,
    saveNavigationAfterRun,
  }
}

function readRequiredString(args: Record<string, unknown>, field: string): string {
  const value = readOptionalString(args, field)
  if (value === undefined) {
    throw new Error(`projectPlanning Host Run requires ${field}.`)
  }
  return value
}

function readOptionalString(args: Record<string, unknown>, field: string): string | undefined {
  const value = args[field]
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function readOptionalBoolean(args: Record<string, unknown>, field: string): boolean | undefined {
  const value = args[field]
  return typeof value === 'boolean' ? value : undefined
}

function readOptionalStringArray(args: Record<string, unknown>, field: string): string[] | undefined {
  const value = args[field]
  if (!Array.isArray(value)) return undefined
  const strings = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0)
  return strings.length > 0 ? strings : undefined
}

function readOptionalStringRecord(args: Record<string, unknown>, field: string): Record<string, string> | undefined {
  const value = args[field]
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') continue
    const normalized = item.trim()
    if (normalized.length > 0) result[key] = normalized
  }
  return Object.keys(result).length > 0 ? result : undefined
}
