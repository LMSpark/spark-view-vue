/**
 * @module app:services/page-data-design-host-run-provider
 * 职责：pageDataDesign Host Run preset，归一化为 pageDesign 并绑定 selective save 上下文。
 * 边界：不单独注册业务能力；alias 仅用于调度路由。
 * AI用途：排查 SSE pageDataDesign 如何落到 pageDesign run 与 pagedata.json 落盘时，用本模块。
 */
import type {
  AiAgentHost,
  AiAgentHostRunResult,
  AiAgentTaskChatOptions,
} from '@spark-appworks/spark-ai/agent'
import type { AiJsonParams } from '@spark-appworks/spark-ai/json'
import type { PageNodeFileName, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  PAGE_DESIGN_MODULE_ID,
  ensurePageDesignBusiness,
  type PageDesignRunInput,
} from '@/services/page-design/page-design-business'
import type { PageDesignAllowedOperations } from '@/services/page-design/page-design-gates'
import {
  bindPageDesignRunContext,
  clearPageDesignRunContext,
} from '@/services/page-design/page-design-gates'
import {
  createHeadlessPageDesignEditor,
  createPageDesignEditorGetter,
} from '@/services/page-design/page-design-headless'
import {
  wrapPageDesignHostRunWithDelivery,
} from '@/services/page-design/page-design-host-run-provider'
import type {
  AiHostRunPrepare,
  AiHostRunTarget,
} from '@/services/ai/ai-host-run-bridge'

export const PAGE_DATA_DESIGN_MODULE_ID = 'pageDataDesign'

/** pageDataDesign preset：只允许 DataSet / pagedata.json。 */
export const PAGE_DATA_DESIGN_ALLOWED_OPERATIONS = {
  dataSet: true,
  nodeTree: false,
  script: false,
  style: false,
  navigation: false,
} as const satisfies PageDesignAllowedOperations

export const PAGE_DATA_DESIGN_SAVE_FILE_NAMES = ['pagedata.json'] as const satisfies readonly PageNodeFileName[]

const PAGE_DATA_DESIGN_RUN_CONTEXT = {
  allowedOperations: PAGE_DATA_DESIGN_ALLOWED_OPERATIONS,
  deliverySaveFileNames: PAGE_DATA_DESIGN_SAVE_FILE_NAMES,
} as const

/** Page Data Design Host Input 的输入数据。 */
export type PageDataDesignHostInput = Readonly<{
  pageId: string
  description: string
  effectiveDescription: string
  projectId?: string
  planningTitle?: string
  planningPath?: string
  dataRequirement?: string
}>

export function normalizePageDataDesignToPageDesignInput(
  args: Record<string, unknown>,
): AiJsonParams {
  const input = readPageDataDesignHostInput(args)
  const description = mergePageDataDesignDescription(input)
  const normalized: PageDesignRunInput = {
    pageId: input.pageId,
    description,
    effectiveDescription: input.effectiveDescription,
    allowedOperations: PAGE_DATA_DESIGN_ALLOWED_OPERATIONS,
  }
  if (input.projectId !== undefined) normalized.projectId = input.projectId
  if (input.planningTitle !== undefined) normalized.planningTitle = input.planningTitle
  if (input.planningPath !== undefined) normalized.planningPath = input.planningPath
  return normalized
}

const pageDataDesignEditors = new Map<string, ProjectWorkspace>()

export const preparePageDataDesignHostRun: AiHostRunPrepare<AiAgentHost> = async (event, host) => {
  if (event.alias !== PAGE_DATA_DESIGN_MODULE_ID) return host

  const pageId = readPageDataDesignPageId(event.args)
  if (pageId !== null) {
    const editor = createHeadlessPageDesignEditor()
    await editor.selectPage(pageId, { forceReload: true })
    pageDataDesignEditors.set(pageId, editor)
  }

  const pageDesignHost = ensurePageDesignBusiness({
    host,
    getPageDesignEditor: createPageDesignEditorGetter(pageDataDesignEditors),
  })

  return createPageDataDesignPresetHost(pageDesignHost, pageId)
}

function createPageDataDesignPresetHost(
  host: AiHostRunTarget,
  pageId: string | null,
): AiHostRunTarget {
  const savingHost = wrapPageDesignHostRunWithDelivery(host, pageId, pageDataDesignEditors)
  return {
    has(alias) {
      if (alias === PAGE_DATA_DESIGN_MODULE_ID) return true
      return savingHost.has(alias)
    },
    dryRun(alias, args) {
      if (alias !== PAGE_DATA_DESIGN_MODULE_ID) return savingHost.dryRun(alias, args)
      return savingHost.dryRun(
        PAGE_DESIGN_MODULE_ID,
        normalizePageDataDesignToPageDesignInput(readJsonObjectArgs(args)),
      )
    },
    async run(
      alias: string,
      args: AiJsonParams,
      chat?: AiAgentTaskChatOptions,
    ): Promise<AiAgentHostRunResult> {
      if (alias !== PAGE_DATA_DESIGN_MODULE_ID) {
        return savingHost.run(alias, args, chat)
      }
      const normalizedArgs = normalizePageDataDesignToPageDesignInput(readJsonObjectArgs(args))
      if (pageId !== null) bindPageDataDesignRunContext(pageId)
      try {
        return await savingHost.run(PAGE_DESIGN_MODULE_ID, normalizedArgs, chat)
      } finally {
        if (pageId !== null) clearPageDataDesignRunContext(pageId)
      }
    },
  }
}

function bindPageDataDesignRunContext(pageId: string): void {
  bindPageDesignRunContext(pageId, PAGE_DATA_DESIGN_RUN_CONTEXT)
}

function clearPageDataDesignRunContext(pageId: string): void {
  clearPageDesignRunContext(pageId)
}

function readJsonObjectArgs(args: unknown): Record<string, unknown> {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('pageDataDesign args must be a JSON object.')
  }
  return args as Record<string, unknown>
}

function readPageDataDesignPageId(args: Record<string, unknown>): string | null {
  const pageId = args['pageId']
  if (typeof pageId !== 'string') return null
  const normalized = pageId.trim()
  return normalized.length > 0 ? normalized : null
}

function readPageDataDesignHostInput(args: Record<string, unknown>): PageDataDesignHostInput {
  const pageId = readRequiredString(args, 'pageId')
  const description = readRequiredString(args, 'description')
  const effectiveDescription = readRequiredString(args, 'effectiveDescription')
  const projectId = readOptionalString(args, 'projectId')
  const planningTitle = readOptionalString(args, 'planningTitle')
  const planningPath = readOptionalString(args, 'planningPath')
  const dataRequirement = readOptionalString(args, 'dataRequirement')
  return {
    pageId,
    description,
    effectiveDescription,
    ...(projectId === undefined ? {} : { projectId }),
    ...(planningTitle === undefined ? {} : { planningTitle }),
    ...(planningPath === undefined ? {} : { planningPath }),
    ...(dataRequirement === undefined ? {} : { dataRequirement }),
  }
}

function mergePageDataDesignDescription(input: PageDataDesignHostInput): string {
  const base = input.description.trim()
  const dataRequirement = input.dataRequirement?.trim()
  if (dataRequirement === undefined || dataRequirement.length === 0) return base
  return `${base}\n\n数据建模补充说明:\n${dataRequirement}`
}

function readRequiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string') {
    throw new Error(`pageDataDesign requires string field "${key}".`)
  }
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`pageDataDesign requires non-empty "${key}".`)
  }
  return normalized
}

function readOptionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}
