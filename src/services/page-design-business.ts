/**
 * pageDesign AI business registration.
 *
 * This app-layer service exposes the current ProjectModel to spark-ai without
 * making spark-project-model depend on AI runtime or generated metadata files.
 */
import {
  createSimpleInputContract,
  VcmNativeAgentAdapter,
  type AiAgentBeforeFunctionCallDirective,
  type AiAgentBeforeFunctionCallOptions,
  type AiAgentHost,
  type AiAgentRuntimeContext,
  type AiAgentToolLoopNudgeContext,
  type AiAgentToolLoopNudgeReason,
} from '@/services/spark-ai-agent-bindings'
import type { EnrichFunctionCallFailureCommand } from '@spark-appworks/spark-ai/agent'
import type { AiModuleMetadataJson } from '@spark-appworks/spark-ai/vcm-native'
import { resolveModuleMetadataJson, VCM_NATIVE_TOOL_NAMES } from '@spark-appworks/spark-ai/vcm-native'
import { ProjectModel } from '@spark-appworks/spark-project-model'
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  evaluatePageDesignMutationToolGate,
} from '@/services/page-design-gates'
import { projectPageSurfaceRuntimeMetadataDocument } from '../../generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime'
import { createPageDesignVcmKnowledgeProvider } from './page-design/page-design-vcm-knowledge-provider'

export const PAGE_DESIGN_MODULE_ID = 'pageDesign'

export type PageDesignRunMode = 'create' | 'update' | 'fix'

export type PageDesignAllowedOperations = {
  nodeTree?: boolean
  dataSet?: boolean
  script?: boolean
  style?: boolean
  navigation?: boolean
}

export type PageDesignRunInput = {
  pageId: string
  description: string
  /** readPlanningProjection 的 effectiveDescription；runner 必填。 */
  effectiveDescription: string
  /** 项目根 path 段 id；用于 systemPrompt 给出 concrete /project[id] 示例。 */
  projectId?: string
  planningTitle?: string
  planningPath?: string
  mode?: PageDesignRunMode
  allowedOperations?: PageDesignAllowedOperations
  preserveExistingInteractions?: boolean
  /** 未声明 implGate 时 fail-fast；生产 runner 建议 true。 */
  strictImplGate?: boolean
}

export type ResolvePageDesignPlanningContextOptions = {
  /** 仅 e2e/脚手架：投影为空时用本轮 description 兜底。生产 runner 勿传。 */
  fallbackDescription?: string
}

export type EnsurePageDesignBusinessOptions = {
  host: AiAgentHost
  getPageDesignEditor: (context: { moduleInstanceId: string }) => ProjectWorkspace
}


export function resolvePageDesignPlanningContext(
  project: ProjectModel,
  pageId: string,
  options: ResolvePageDesignPlanningContextOptions = {},
): Pick<PageDesignRunInput, 'effectiveDescription' | 'planningTitle' | 'planningPath'> {
  const summary = project.readPlanningProjection().find(item => item.pageId === pageId)
  if (summary === undefined) {
    throw new Error(`pageDesign: no planning projection for pageId "${pageId}".`)
  }
  let effectiveDescription = summary.effectiveDescription.trim()
  if (effectiveDescription.length === 0) {
    const fallback = options.fallbackDescription?.trim() ?? ''
    if (fallback.length === 0) {
      throw new Error(
        `pageDesign: page "${pageId}" has empty effectiveDescription; set navigation description before AI run.`,
      )
    }
    effectiveDescription = fallback
  }
  const planningTitle = summary.title.trim()
  const planningPath = summary.path.trim()
  return {
    effectiveDescription,
    planningTitle: planningTitle.length > 0 ? planningTitle : pageId,
    planningPath: planningPath.length > 0 ? planningPath : `/${pageId}`,
  }
}

export function ensurePageDesignBusiness(options: EnsurePageDesignBusinessOptions): AiAgentHost {
  return options.host.ensure(PAGE_DESIGN_MODULE_ID, {
    moduleId: PAGE_DESIGN_MODULE_ID,
    create: () => VcmNativeAgentAdapter.createRegistration({
      moduleClass: ProjectModel,
      metadata: readPageDesignProjectMetadata(),
      options: {
        moduleId: PAGE_DESIGN_MODULE_ID,
        knowledge: createPageDesignVcmKnowledgeProvider(),
        inputContract: createSimpleInputContract<PageDesignRunInput>({
          businessId: PAGE_DESIGN_MODULE_ID,
          identityField: 'pageId',
          messageField: 'description',
          paramsSchema: {
            type: 'object',
            properties: {
              pageId: { type: 'string' },
              description: { type: 'string' },
              effectiveDescription: { type: 'string' },
              projectId: { type: 'string' },
              planningTitle: { type: 'string' },
              planningPath: { type: 'string' },
              mode: { type: 'string', enum: ['create', 'update', 'fix'] },
              allowedOperations: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  nodeTree: { type: 'boolean' },
                  dataSet: { type: 'boolean' },
                  script: { type: 'boolean' },
                  style: { type: 'boolean' },
                  navigation: { type: 'boolean' },
                },
              },
              preserveExistingInteractions: { type: 'boolean' },
              strictImplGate: { type: 'boolean' },
            },
            required: ['pageId', 'description', 'effectiveDescription'],
            additionalProperties: false,
          },
          systemPrompt: createPageDesignSystemPrompt,
          title: input => `pageDesign:${input.pageId}`,
          readonlySteps: [
            '策划约束已注入 effectiveDescription（来自 readPlanningProjection）；禁止从 navigationRoot 或菜单节点拼接需求。',
            '先查询 ProjectModel 能力边界，再通过 openPageDesign(pageId) 进入 ConfigPageNode。',
            '结构改写只走 vcm_script 原生对象链；函数参数以 VCM metadata schema 为准。',
          ],
        }),
        resolveInstance: ctx => resolvePageDesignProject(options, ctx),
        beforeFunctionCall: (instance, hookOptions) => evaluatePageDesignBeforeFunctionCall(
          instance,
          hookOptions,
        ),
        executionToolNames: PAGE_DESIGN_EXECUTION_TOOL_NAMES,
        planWithoutToolMarkers: PAGE_DESIGN_PLAN_WITHOUT_TOOL_MARKERS,
        toolLoopNudge: createPageDesignToolLoopNudge,
        enrichRecoveryHints: enrichPageDesignRecoveryHints,
        ...(projectPageSurfaceRuntimeMetadataDocument.$defs === undefined
          ? {}
          : { jsonSchemaDefs: projectPageSurfaceRuntimeMetadataDocument.$defs }),
      },
    }),
  })
}

const PAGE_DESIGN_EXECUTION_TOOL_NAMES = new Set<string>([
  VCM_NATIVE_TOOL_NAMES.script,
])

const PAGE_DESIGN_PLAN_WITHOUT_TOOL_MARKERS = [
  'openpagedesign',
  'editnodetree',
  'editdataset',
] as const

function createPageDesignToolLoopNudge(context: AiAgentToolLoopNudgeContext): string | undefined {
  const pageId = context.moduleInstanceId.trim()
  if (pageId.length === 0) return undefined
  return buildPageDesignToolLoopNudge(context.reason, pageId)
}

function buildPageDesignToolLoopNudge(
  reason: AiAgentToolLoopNudgeReason,
  pageId: string,
): string | undefined {
  const scriptShape = pageDesignScriptSopLines(pageId)
  switch (reason) {
    case 'plan_without_tool':
      return [
        '写页面时优先 vcm_script；若已读完 vcm_action_guide，立即执行脚本链。',
        ...scriptShape,
      ].join('\n')
    case 'execution_phase':
      return [
        `目录/指南阶段已完成，pageId="${pageId}"。禁止再重复查目录，直接执行 vcm_script。`,
        ...scriptShape,
        'openPageDesign 必须 await；editDataSet/editNodeTree 直接传 async callback；完成后 agent_complete({ summary })。',
      ].join('\n')
    case 'module_script_retry':
      return [
        '上一次 vcm_script 失败：按 RECOVERY_HINT 修正，禁止再查 catalog。',
        ...scriptShape,
        'createTable 签名是 createTable({ tableName, columns })，不是 createTable(name, columns)。',
      ].join('\n')
    default:
      return undefined
  }
}

function pageDesignScriptSopLines(pageId: string): readonly string[] {
  return [
    `vcm_script 主路径：const page = await this.openPageDesign({ pageId: "${pageId}" });`,
    'await page.editDataSet(async (ds) => { ds.createTable({ tableName: "<TableName>", columns: [{ name, type, label }] }); });',
    'await page.editNodeTree(async (tree) => { tree.addNode({ parentComponentId: null, node: { type: "r-table", id: "...", props: { dataViewKey: "<table@viewId>", dataMember: "rows" } } }); });',
  ]
}

function enrichPageDesignRecoveryHints(command: EnrichFunctionCallFailureCommand): readonly string[] {
  const hints: string[] = []
  const { protocolToolName, callResult } = command

  if (protocolToolName === VCM_NATIVE_TOOL_NAMES.actionGuide && callResult.code === 'FUNCTION_NOT_FOUND') {
    hints.push('actionName 必须是 openPageDesign 等业务 action，不能是 vcm_script 等协议工具。')
  }

  if (callResult.code === 'SCRIPT_EXECUTION_FAILED' && protocolToolName === VCM_NATIVE_TOOL_NAMES.script) {
    if (callResult.msg.includes('toJSON')) {
      hints.push('脚本勿调 toJSON；用 openPageDesign → editDataSet/editNodeTree mutator 链式 API。')
    }
    if (callResult.msg.includes('.call is not a function')) {
      hints.push('ConfigPageNode 无 call()；改用 page.editNodeTree(async tree => ...) / page.editDataSet(async ds => ...)。')
    }
    if (callResult.msg.includes('editDataSet is not a function')
      || callResult.msg.includes('editNodeTree is not a function')) {
      hints.push('vcm_script 必须先 await this.openPageDesign({ pageId }) 得到 page，再 await page.editDataSet(async ds => ...)。')
    }
    if (callResult.msg.includes("reading 'includes'")) {
      hints.push('createTable 签名：createTable({ tableName: "<TableName>", columns: [{ name, type, label }] })；勿用 positional 参数。')
      hints.push('先 editDataSet 建表与 default 视图，再 editNodeTree 按 VCM 元数据声明的节点 type 和 props schema 构造节点。')
    }
    if (callResult.msg.includes('run is not a function')) {
      hints.push('editDataSet/editNodeTree 必须直接传函数：page.editDataSet(async ds => ...)；勿把 createTable 参数对象当成 run。')
    }
  }

  if (callResult.code === 'SCRIPT_EXECUTION_FAILED') {
    hints.push('openPageDesign 返回 ConfigPageNode 链式对象：用 page.editNodeTree(async tree => ...)/page.editDataSet(async ds => ...)，勿用 page.call()。')
  }

  if (callResult.code === 'SCHEMA_VALIDATION_FAILED' && protocolToolName === VCM_NATIVE_TOOL_NAMES.script) {
    if (callResult.msg.includes('requires a callback') || callResult.msg.includes('must be a function')) {
      hints.push('editDataSet/editNodeTree 必须直接传 async callback；勿把 createTable 参数对象当作 run。')
    }
  }

  return hints
}

function createPageDesignSystemPrompt(input: PageDesignRunInput): string {
  const effectiveDescription = input.effectiveDescription.trim()
  if (effectiveDescription.length === 0) {
    throw new Error('pageDesign systemPrompt requires effectiveDescription from readPlanningProjection.')
  }
  const planningTitle = input.planningTitle?.trim() ?? input.pageId
  const planningPath = input.planningPath?.trim() ?? `/${input.pageId}`
  const projectId = input.projectId?.trim() ?? 'homepage'
  return [
    `当前 pageDesign 页面: ${input.pageId}（${planningTitle}，path=${planningPath}）`,
    `projectId=${projectId}；pageId=${input.pageId}。`,
    '策划约束（readPlanningProjection.effectiveDescription，勿从 navigation 树拼接）:',
    effectiveDescription,
    `用户本轮目标: ${input.description}`,
    '写页面的主通道: 调用 vcm_script({ script })；script 是 async function body，由运行时执行，不要只输出计划文字。',
    'script 内 this 是当前 ProjectModel 脚本上下文；不要把 /kind[id]/ path 链作为主用法。',
    `vcm_script 形状（pageId="${input.pageId}"，表名/字段按 effectiveDescription 与 VCM schema 决定）：`,
    ...pageDesignScriptSopLines(input.pageId),
    `page.setFileText("script.js", ""); page.setFileText("style.css", "");`,
    `return { ruleJson: page.getFileText("rule.json"), pageDataJson: page.getFileText("pagedata.json"), script: page.getFileText("script.js"), style: page.getFileText("style.css") };`,
    '脚本代理支持原生形态：editDataSet(async ds=>...)、editNodeTree(async tree=>...)、createTable({ tableName, columns })、addNode({ parentComponentId, node })。',
    'openPageDesign 必须 await；读取必要 VCM 函数 schema 后必须 vcm_script 生成四文件结果，最后 agent_complete。',
    'pageId 来自当前输入；勿把 pageId 当成 projectId。',
    '元数据来源: generated pageDesign module metadata.',
    '执行原则: LLM 生成代码 -> vcm_script 执行代码 -> ConfigPageNode 内存模型得到 rule.json / pagedata.json / script.js / style.css；落盘由外层 ProjectWorkspace 处理。',
  ].join('\n')
}

function resolvePageDesignProject(
  options: EnsurePageDesignBusinessOptions,
  ctx: AiAgentRuntimeContext,
): ProjectModel {
  const moduleInstanceId = ctx.moduleInstanceId
  if (moduleInstanceId.trim().length === 0) {
    throw new Error('pageDesign ProjectModel requires host.moduleInstanceId.')
  }
  const host = options.getPageDesignEditor({ moduleInstanceId })
  host.project.openPageDesign(moduleInstanceId)
  return host.project
}

export {
  assertPageDesignRunGateAllowed,
  evaluatePageDesignMutationToolGate,
  readPageDesignGateState,
  validatePageDesignRunGate,
} from '@/services/page-design-gates'

export type {
  PageDesignGateState,
  PageDesignGateValidationResult,
  PageDesignImplGate,
  PageDesignPlanningStatus,
} from '@/services/page-design-gates'

function evaluatePageDesignBeforeFunctionCall(
  project: ProjectModel,
  options: AiAgentBeforeFunctionCallOptions,
): AiAgentBeforeFunctionCallDirective {
  const pageId = options.moduleInstanceId.trim()
  if (pageId.length === 0) {
    return { status: 'allow' }
  }
  const summary = project.readPlanningProjection().find(item => item.pageId === pageId)
  if (summary === undefined) {
    return {
      status: 'reject',
      reason: `pageDesign: no planning projection for pageId "${pageId}".`,
      fix: '先 readPlanningProjection，确认 pageId 存在于 pageFeatures。',
    }
  }
  const gate = evaluatePageDesignMutationToolGate({
    toolName: options.toolName,
    summary,
  })
  if (gate.ok) {
    return { status: 'allow' }
  }
  return {
    status: 'reject',
    reason: gate.reason ?? 'pageDesign gate rejected mutation tool.',
    ...(gate.fix === undefined ? {} : { fix: gate.fix }),
  }
}

function readPageDesignProjectModule() {
  return projectPageSurfaceRuntimeMetadataDocument.modules.find(
    module => module.rootApi.kind === 'project',
  )
}

function readPageDesignProjectMetadata(): AiModuleMetadataJson {
  const projectModule = readPageDesignProjectModule()
  if (projectModule === undefined) {
    throw new Error('pageDesign runtime metadata missing ProjectModel rootApi.')
  }
  return resolveModuleMetadataJson(projectModule, {
    inlineSchemaRefs: false,
    ...(projectPageSurfaceRuntimeMetadataDocument.$defs === undefined
      ? {}
      : { schemaDefs: projectPageSurfaceRuntimeMetadataDocument.$defs }),
  })
}
