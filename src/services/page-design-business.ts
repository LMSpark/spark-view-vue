/**
 * pageDesign AI business registration.
 *
 * This app-layer service exposes the current ProjectModel to spark-ai without
 * making spark-project-model depend on AI runtime or generated metadata files.
 */
import {
  AiModuleAdapter,
  createSimpleInputContract,
  type AiAgentBeforeFunctionCallDirective,
  type AiAgentBeforeFunctionCallOptions,
  type AiAgentHost,
} from '@spark-appworks/spark-ai/agent'
import type { AiModuleMetadataJson, AiModulePathContext } from '@spark-appworks/spark-ai/modules'
import { resolveModuleMetadataJson } from '@spark-appworks/spark-ai/modules'
import { ProjectModel } from '@spark-appworks/spark-project-model'
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  evaluatePageDesignMutationToolGate,
} from '@/services/page-design-gates'
import { pageDesignRuntimeMetadataDocument } from './page-design/page-design-module-metadata.runtime'
import {
  createPageDesignSparkComponentModuleBundle,
  SPARK_COMPONENT_MODULE_KIND,
} from './page-design/spark-component-module'

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

export type PageDesignPayloadGuideValidationResult = {
  ok: boolean
  matchedToolNames: string[]
  issue?: string
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
  const apiRegistry = readPageDesignProjectModule()?.apiRegistry
  const knowledgeBundle = createPageDesignSparkComponentModuleBundle(
    apiRegistry === undefined ? {} : { apiRegistry },
  )
  const companionModules = [
    knowledgeBundle.catalogModule,
    ...knowledgeBundle.guideModules,
  ]

  return options.host.ensure(PAGE_DESIGN_MODULE_ID, {
    moduleId: PAGE_DESIGN_MODULE_ID,
    create: () => AiModuleAdapter.createRegistration({
      moduleClass: ProjectModel,
      metadata: readPageDesignProjectMetadata(),
      options: {
        moduleId: PAGE_DESIGN_MODULE_ID,
        companionModules,
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
            '复杂参数先 queryPayloads / guidePayload，结构改写优先 module_script。',
          ],
        }),
        resolveInstance: ctx => resolvePageDesignProject(options, ctx),
        beforeFunctionCall: (instance, hookOptions) => evaluatePageDesignBeforeFunctionCall(
          instance,
          hookOptions,
        ),
        ...(pageDesignRuntimeMetadataDocument.$defs === undefined
          ? {}
          : { jsonSchemaDefs: pageDesignRuntimeMetadataDocument.$defs }),
      },
    }),
  })
}

export function validatePageDesignPayloadGuidesFromSession(
  _files: unknown,
  sessionRecord: unknown,
): PageDesignPayloadGuideValidationResult {
  const toolNames = collectToolNames(sessionRecord)
  const matchedToolNames = toolNames.filter(isPayloadCatalogToolName)
  const hasQuery = matchedToolNames.some(name => normalizePayloadToolName(name) === 'querypayloads')
  const hasGuide = matchedToolNames.some(name => normalizePayloadToolName(name) === 'guidepayload')
  if (hasQuery && hasGuide) {
    return { ok: true, matchedToolNames }
  }
  return {
    ok: false,
    matchedToolNames,
    issue: hasQuery || hasGuide
      ? 'session must record both queryPayloads and guidePayload before node-tree writes'
      : 'session did not record payload guide or payload query tool usage',
  }
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
    '写页面的主通道: 调用 module_script({ script })；script 是 async function body，由运行时执行，不要只输出计划文字。',
    'script 内 this 是当前 ProjectModel 脚本上下文；不要把 /kind[id]/ path 链作为主用法。',
    `组件查询: queryPayloads({ moduleKind: "node-tree", payloadRef: "spark.component", keyword: "form" })。`,
    '组件指南: guidePayload({ key: "r-form", moduleKind: "node-tree", payloadRef: "spark.component" })；key 来自 queryPayloads，可用 type 别名。',
    'spark-component 目录固定由运行时挂接；勿 module_find list spark-component，直接 queryPayloads / guidePayload。',
    `组件目录 kind 为 ${SPARK_COMPONENT_MODULE_KIND}；写 node-tree 前必须先 queryPayloads / guidePayload(spark.component)。`,
    `module_script 形状（pageId="${input.pageId}"，表名/字段按 effectiveDescription 与 guidePayload 决定）：`,
    `const page = await this.openPageDesign({ pageId: "${input.pageId}" });`,
    `await page.editDataSet(async (ds) => { ds.createTable({ tableName: "<TableName>", columns: [{ name, type, label }] }); });`,
    `await page.editNodeTree(async (tree) => { tree.addNode({ parentComponentId: null, node: { type: "<来自 guidePayload>", id: "...", props: { dataViewKey: "<table@viewId>", contextDataMember: "currentRow" } } }); });`,
    `page.setFileText("script.js", ""); page.setFileText("style.css", "");`,
    `return { ruleJson: page.getFileText("rule.json"), pageDataJson: page.getFileText("pagedata.json"), script: page.getFileText("script.js"), style: page.getFileText("style.css") };`,
    '脚本代理支持原生形态：editDataSet(async ds=>...)、editNodeTree(async tree=>...)、createTable({ tableName, columns })、addNode({ parentComponentId, node })。',
    'openPageDesign 必须 await；guidePayload 成功后禁止再重复 queryPayloads；下一回合必须 module_script 生成四文件结果，最后 agent_complete。',
    'pageId 来自当前输入；勿把 pageId 当成 projectId。',
    '元数据来源: generated pageDesign module metadata + spark-component catalog module.',
    '执行原则: LLM 生成代码 -> module_script 执行代码 -> ConfigPageNode 内存模型得到 rule.json / pagedata.json / script.js / style.css；落盘由外层 ProjectWorkspace 处理。',
  ].join('\n')
}

function resolvePageDesignProject(
  options: EnsurePageDesignBusinessOptions,
  ctx: AiModulePathContext,
): ProjectModel {
  const moduleInstanceId = ctx.host?.moduleInstanceId
  if (moduleInstanceId === undefined || moduleInstanceId.trim().length === 0) {
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
  return pageDesignRuntimeMetadataDocument.modules.find(
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
    ...(pageDesignRuntimeMetadataDocument.$defs === undefined
      ? {}
      : { schemaDefs: pageDesignRuntimeMetadataDocument.$defs }),
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function collectToolNames(value: unknown): string[] {
  const names: string[] = []
  const visited = new Set<unknown>()
  const visit = (current: unknown): void => {
    if (current === null || typeof current !== 'object') return
    if (visited.has(current)) return
    visited.add(current)
    if (Array.isArray(current)) {
      for (const item of current) visit(item)
      return
    }
    if (!isPlainObject(current)) return
    const toolName = current['toolName'] ?? current['name'] ?? current['functionName']
    if (typeof toolName === 'string') names.push(toolName)
    for (const item of Object.values(current)) visit(item)
  }
  visit(value)
  return [...new Set(names)]
}

function isPayloadCatalogToolName(name: string): boolean {
  const normalized = normalizePayloadToolName(name)
  return normalized === 'querypayloads' || normalized === 'guidepayload'
}

function normalizePayloadToolName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/gu, '')
}
