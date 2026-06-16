/**
 * @module app:services/requirement-import-host-run-provider
 * 职责：提供应用运行时 service 层的 requirement import host run provider 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * APP 壳层 requirementImport Host Run provider（隔离式门面实例）。
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
} from '@/services/ai/ai-host-run-bridge'
import { createAiAgentTurnCallbacks } from '@/services/ai/ai-turn-bridge'
import {
  buildRequirementImportAgentInput,
  ensureRequirementImportBusiness,
  REQUIREMENT_IMPORT_MODULE_ID,
} from '@/services/requirement-import/requirement-import-business'
import { createHeadlessRequirementImportEditor } from '@/services/requirement-import/requirement-import-headless'
import {
  attachAiDeliveryResult,
  createAiDeliveryFailureError,
  createAiDeliveryResultExtras,
  toError,
  type AiDeliveryArtifact,
  type AiDeliveryMode,
  type AiDeliveryPort,
} from '@/services/ai/ai-delivery-port'

export {
  createHeadlessRequirementImportEditor,
  createRequirementImportEditorGetter,
  resolveRequirementImportEditor,
  type HeadlessRequirementImportEditorScope,
  type RequirementImportEditorResolveContext,
} from '@/services/requirement-import/requirement-import-headless'

// --- delivery ---

/** requirementImport Host Run 落盘时携带的 editor 与导航保存策略。 */
export type RequirementImportDeliveryContext = Readonly<{
  /** headless ProjectWorkspace 实例，持有当前项目的导航树和配置页模型 */
  editor: ProjectWorkspace
  /** Host Run 成功结束后是否自动保存导航树变更；false 时仅标记 dirty 不落盘 */
  saveNavigationAfterRun: boolean
}>

type CreateRequirementImportDeliveryPortOptions = Readonly<{
  mode: AiDeliveryMode
  rollbackStatus: 'skipped' | 'rolledBack'
}>

export function createRequirementImportInlineDeliveryPort(): AiDeliveryPort<RequirementImportDeliveryContext> {
  return createRequirementImportDeliveryPort({
    mode: 'manual',
    rollbackStatus: 'skipped',
  })
}

export function createRequirementImportHostRunDeliveryPort(): AiDeliveryPort<RequirementImportDeliveryContext> {
  return createRequirementImportDeliveryPort({
    mode: 'auto',
    rollbackStatus: 'rolledBack',
  })
}

function createRequirementImportDeliveryPort(
  options: CreateRequirementImportDeliveryPortOptions,
): AiDeliveryPort<RequirementImportDeliveryContext> {
  return {
    mode: options.mode,
    async save(context) {
      const navigationDirty = context.editor.project.navigationDirty
      if (!context.saveNavigationAfterRun || !navigationDirty) {
        return {
          mode: options.mode,
          status: 'skipped',
          artifacts: navigationDirty ? [createNavigationArtifact('skipped')] : [],
        }
      }
      try {
        await context.editor.saveAll()
        return {
          mode: options.mode,
          status: 'saved',
          artifacts: [createNavigationArtifact('saved')],
        }
      } catch (error: unknown) {
        return {
          mode: options.mode,
          status: 'failed',
          artifacts: [createNavigationArtifact('dirty')],
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },
    trace() {
      return Promise.resolve()
    },
    rollback(context, error) {
      const navigationDirty = context.editor.project.navigationDirty
      return Promise.resolve({
        mode: options.mode,
        status: navigationDirty ? options.rollbackStatus : 'skipped',
        artifacts: navigationDirty ? [createNavigationArtifact(options.rollbackStatus)] : [],
        message: error.message,
      })
    },
  }
}

function createNavigationArtifact(status: AiDeliveryArtifact['status']): AiDeliveryArtifact {
  return {
    kind: 'navigation',
    name: 'navigation',
    status,
  }
}

type RequirementImportHostRunScope = Readonly<{
  tenantId: string
  projectId: string
  scopeKey: string
  agentScopeKey: string
  saveNavigationAfterRun: boolean
}>

export const prepareRequirementImportHostRun: AiHostRunPrepare<AiAgentHost> = async (event, bridgeHost) => {
  if (event.alias !== REQUIREMENT_IMPORT_MODULE_ID) return bridgeHost

  const scope = readRequirementImportHostRunScope(event.args, event.requestId)
  const editor = createHeadlessRequirementImportEditor({
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
  const requirementImportHost = ensureRequirementImportBusiness({
    host: runHost,
    getRequirementImportEditor: () => editor,
  })

  return createScopedRequirementImportHost(requirementImportHost, scope, editor)
}

function createScopedRequirementImportHost(
  host: AiHostRunTarget,
  scope: RequirementImportHostRunScope,
  editor: ProjectWorkspace,
): AiHostRunTarget {
  const delivery = createRequirementImportHostRunDeliveryPort()
  return {
    has(alias) {
      return host.has(alias)
    },
    dryRun(alias, args) {
      if (alias !== REQUIREMENT_IMPORT_MODULE_ID) return host.dryRun(alias, args)
      return host.dryRun(alias, normalizeRequirementImportHostRunInput(args, scope, editor))
    },
    async run(
      alias: string,
      args: AiJsonParams,
      chat?: AiAgentTaskChatOptions,
    ): Promise<AiAgentHostRunResult> {
      const normalizedInput = alias === REQUIREMENT_IMPORT_MODULE_ID
        ? normalizeRequirementImportHostRunInput(args, scope, editor)
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
          deliveryResult.message ?? 'requirementImport Host Run delivery failed.',
          deliveryResult,
        )
      }
      return {
        ...result,
        resultExtras: {
          ...(result.resultExtras ?? {}),
          ...createAiDeliveryResultExtras(deliveryResult),
          requirementImport: {
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

function normalizeRequirementImportHostRunInput(
  args: unknown,
  scope: RequirementImportHostRunScope,
  editor: ProjectWorkspace,
): AiJsonParams {
  if (!isJsonObjectRecord(args)) {
    throw new Error('requirementImport Host Run args must be a JSON object.')
  }
  const record = args
  const documentText = readRequiredString(record, 'documentText')
  const projectName = readOptionalString(record, 'projectName')
  return {
    ...buildRequirementImportAgentInput(scope.projectId, documentText, {
      ...(projectName === undefined ? {} : { projectName }),
    }),
    projectScopeKey: scope.agentScopeKey,
    projectId: scope.projectId,
  }
}

function isJsonObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readRequirementImportHostRunScope(
  args: Record<string, unknown>,
  requestId?: string,
): RequirementImportHostRunScope {
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
    throw new Error(`requirementImport Host Run requires ${field}.`)
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
