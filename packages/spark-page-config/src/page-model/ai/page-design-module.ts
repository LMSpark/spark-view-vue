/**
 * PageDesign AI 业务注册——整个 spark-page-config AI 子系统的编排入口。
 *
 * ## 架构概览
 * ```
 * createPageDesignBusinessKindDefinition(options)
 *   ├── new PageDesignService({ getEditHost })          // 业务服务层：封装 PageNode 子模型读写
 *   ├── new AiModuleRuntime()                          // AI 模块运行时
 *   ├── runtime.register(new PageDesignRootAiModule())  // 根 kind：实例发现与子模块路由
 *   ├── runtime.register(new PageDesignLifecycleAiModule())     // 流程控制
 *   ├── runtime.register(new PageDesignStandardPageAiModule())  // 工业标准件
 *   ├── runtime.register(new PageDesignTextModelAiModule())     // script/style 编辑
 *   ├── runtime.register(new PageDesignPayloadCatalogAiModule()) // 组件知识库
 *   ├── runtime.register(new PageDesignNodeTreeAiModule())      // rule.json 编辑
 *   ├── runtime.register(new PageDesignDatasetAiModule())       // pagedata.json 编辑
 *   └── → AiAgentDefinition { runtime, inputContract, sessionStore, systemPrompt, hooks }
 * ```
 *
 * ## 会话生命周期
 * ```
 * 1. onStartSession    → service.bootstrap() 校验 live binding
 * 2. toOrchestration   → 生成首轮 tool_call 编排：
 *                         module_find → describeProgress → describeDesignFlow
 * 3. LLM 自主循环      → 按 PageNode 阶段检测和 100 步检查视图，通过标准件/子 kind 编辑 PageNode
 * 4. afterFunctionCall → 检测 edit host 不可用 → abort 会话
 * 5. releaseModuleInstance → service.releasePage() 清理资源
 * ```
 *
 * ## PageNode 成品边界
 * 最新页面节点由基类 navigation 与配置页内容子模型 rule / dataSet / script / style 组成。
 * 标准件优先一次装配，底层工具用于补充特殊需求和修复。
 *
 * ## 五种运行模式
 * - create：从零建立新页面
 * - modify：先盘点旧配置，再小步修改
 * - fix：定位失败绑定或校验错误，修正后复核
 * - data：只处理数据模型（步骤 21-88）
 * - style：只处理样式（步骤 96-100），不改数据模型
 *
 * ## 公共 API
 * - `createPageDesignBusinessRegistration` → AiAgentRegistration（Host 注册用）
 * - `createPageDesignBusinessKindDefinition` → AiAgentDefinition（kindID 真源）
 * - `ensurePageDesignBusiness` → 便捷门面：自动注册到 AiAgentHost
 */

import {
  createAiAgentScope,
  DefaultAiAgentSessionStore,
  createAiAgentRegistration,
} from '@spark-view/spark-ai/agent'
import type * as SparkAiAgent from '@spark-view/spark-ai/agent'
import {
  booleanSchema,
  enumSchema,
  type AiJsonParamShape,
  type AiJsonParams,
  type AiJsonValue,
  objectSchema,
  paramsSchema,
  stringSchema,
} from '@spark-view/spark-ai/json'
import {
  AiModule,
  AiModuleResult,
  AiModuleRuntime,
  type AiModuleInstanceRef,
} from '@spark-view/spark-ai/modules'
import type { AiModulePathContext } from '@spark-view/spark-ai/modules'
import type {
  PageDesignEditHost,
  PageDesignServiceContext,
} from '../update/page-edit-session'
import { summarizePageDesignFlowPhases } from '../update/artifacts/design-flow'
import { inspectPageDesignFinalIssues } from '../update/artifacts/page-design-stage-detection'
import { PageDesignService } from '../update/page-design-service'
import { PageDesignDatasetAiModule } from './tool-catalogs/dataset-tool-catalog'
import { PageDesignLifecycleAiModule } from './tool-catalogs/lifecycle-tool-catalog'
import { PageDesignNodeTreeAiModule } from './tool-catalogs/node-tree-tool-catalog'
import { PageDesignPayloadCatalogAiModule } from './tool-catalogs/payload-catalog-tool-catalog'
import { PageDesignStandardPageAiModule } from './tool-catalogs/standard-page-tool-catalog'
import { PageDesignTextModelAiModule } from './tool-catalogs/text-model-tool-catalog'
import {
  PAGE_DESIGN_CHILD_MODULES,
  PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
  PAGE_DESIGN_ROOT_KIND,
} from './page-design-kind-ids'

// ── 模块标识与系统提示词片段 ───────────────────────────────

export const PAGE_DESIGN_MODULE_ID = PAGE_DESIGN_ROOT_KIND
export const PAGE_DESIGN_AI_AGENT_HOST_ALIAS = PAGE_DESIGN_MODULE_ID

const PAGE_DESIGN_RUN_MODES = ['create', 'modify', 'fix', 'data', 'style'] as const
const PAGE_DESIGN_RUN_MODE_SET: ReadonlySet<string> = new Set(PAGE_DESIGN_RUN_MODES)

export type PageDesignRunMode = typeof PAGE_DESIGN_RUN_MODES[number]

export type PageDesignAllowedOperations = AiJsonParamShape<{
  addTables?: boolean
  addComponents?: boolean
  editScript?: boolean
  editStyle?: boolean
}>

export type PageDesignRunInput = AiJsonParamShape<{
  pageId: string
  userRequirement: string
  mode?: PageDesignRunMode
  allowedOperations?: PageDesignAllowedOperations
  preserveExistingInteractions?: boolean
}>

// PAGE_DESIGN_REFACTOR_SOURCE[prompt-root]: pageDesign 系统提示词唯一出处；保持小提示词，任务知识通过 lifecycle/payload-catalog 按需查询。
const AI_FUNCTION_ARCHITECTURE_PROMPT = 'pageDesign：SSOT 是 PageNode；100 步只是 PageNode 快照推导出的生产检查视图；四文件编辑只是最后写入投影。path=/pageDesign[pageId]/lifecycle[pageId] 查阶段检测和 100 步大/小阶段，/pageDesign[pageId]/standard-page[pageId] 选工业标准件，/pageDesign[pageId]/<childKind>[pageId] 编辑 PageNode 片段；PageNode 成品包含基类 navigation 与配置页内容 rule、dataSet、script、style，不是旧四文件口径；模块是能力工位而不是推理孤岛，LLM 可根据推理过程跨模块往返，把已确认事实通过模块函数沉淀进 PageNode；业务函数使用 OpenAI 标准 tool_call，function.name 直接是真实函数名，arguments 固定为 {"path":...,"args":...}；不要在 arguments 根层传 functionName；参数看 module_function_guide 和 tool schema；每轮 tool_calls 长度必须为 1，assistant.content 必须为空，等待 tool 结果后再继续；LLM 根据用户需求、流程事实和工具结果自主推理生产路径，凡是标准件能确定性完成的页面不要手写内部逻辑；业务层只在 PageNode 阶段成果和最终产物上做门禁；组件 props 用 queryPayloads/guidePayload 取 payload-catalog 指南；失败读 code/msg/fix/checks；完成时用 agent_complete({summary}) 申请收尾。'
const PAGE_DESIGN_COMPLETE_TOOL_NAME = 'agent_complete'

// ── 公共注册契约 ───────────────────────────────────────────

type PageDesignRuntimeContext = {
  readonly instanceId: string
  readonly moduleId: typeof PAGE_DESIGN_MODULE_ID
  readonly moduleInstanceId: string
}

type PageDesignModuleOptions = {
  readonly getEditToolHost: (context: PageDesignRuntimeContext) => PageDesignEditHost
}

const PAGE_DESIGN_INPUT_SCHEMA = paramsSchema({
  pageId: stringSchema('当前 pageDesign 业务实例身份。由宿主选中的页面 ID 提供，用于定位 PageDesignEditHost。', { minLength: 1 }),
  userRequirement: stringSchema('用户原始页面设计需求。作为 describeDesignFlow({ intent }) 的意图来源。', { minLength: 1 }),
  mode: enumSchema(PAGE_DESIGN_RUN_MODES, '可选。任务模式：新建、改造、修 bug、补数据或调样式。'),
  allowedOperations: objectSchema({
    addTables: booleanSchema('是否允许新增 pagedata.json DataTable。'),
    addComponents: booleanSchema('是否允许新增 rule.json 节点。'),
    editScript: booleanSchema('是否允许改写 script.js。'),
    editStyle: booleanSchema('是否允许改写 style.css。'),
  }, {
    additionalProperties: false,
    description: '可选。调用方对本轮页面设计可执行操作的边界声明。',
  }),
  preserveExistingInteractions: booleanSchema('可选。是否要求保留现有页面交互和 handler。'),
}, ['pageId', 'userRequirement'], 'pageDesign AI 业务启动输入。pageId 是注册声明的实例身份字段。')

// ── pageDesign 业务装配 ────────────────────────────────────

// PAGE_DESIGN_AI_TRACE[page-design-registration]: spark-page-config 拥有 pageDesign AI 业务注册；这里把 lifecycle/text-model/payload-catalog/node-tree/dataset 五个子工具挂到 AI Host。
// PAGE_DESIGN_REFACTOR_SOURCE[page-design-registration]: pageDesign 业务注册唯一入口；mjs/前端壳只应调用注册，不复制子工具和业务规则。
/**
 * 创建 pageDesign 的 AI Host 业务注册。
 *
 * 注册结果包含一个 `AiModuleRuntime`，由它投影 lifecycle、text-model、
 * payload-catalog、node-tree、dataset 五个子 kind。调用方只提供当前页面的
 * live edit host，不参与工具 schema、会话历史或业务写入规则。
 */
export function createPageDesignBusinessRegistration(
  options: PageDesignModuleOptions,
): SparkAiAgent.AiAgentRegistration<PageDesignRunInput> {
  return createAiAgentRegistration(createPageDesignBusinessKindDefinition(options))
}

/**
 * 创建 pageDesign 的 kindID 定义。
 *
 * kindID 定义是 pageDesign AI 业务真源；registration 只是它投影到 Host
 * registry 的结果，task 则由它注册的 inputContract 统一校验和编排。
 */
export function createPageDesignBusinessKindDefinition(
  options: PageDesignModuleOptions,
): SparkAiAgent.AiAgentDefinition<PageDesignRunInput> {
  const service = new PageDesignService({
    getEditHost: (context) => options.getEditToolHost({
      instanceId: context.requestId,
      moduleId: PAGE_DESIGN_MODULE_ID,
      moduleInstanceId: context.pageId,
    }),
  })
  const runtime = new AiModuleRuntime()

  runtime.register(new PageDesignRootAiModule())
  runtime.register(new PageDesignLifecycleAiModule({
    service,
    contextFactory: toServiceContext,
    parentKind: PAGE_DESIGN_ROOT_KIND,
  }))
  runtime.register(new PageDesignStandardPageAiModule({
    service,
    contextFactory: toServiceContext,
    parentKind: PAGE_DESIGN_ROOT_KIND,
  }))
  runtime.register(new PageDesignTextModelAiModule({
    service,
    contextFactory: toServiceContext,
    parentKind: PAGE_DESIGN_ROOT_KIND,
  }))
  runtime.register(new PageDesignPayloadCatalogAiModule({
    parentKind: PAGE_DESIGN_ROOT_KIND,
    service,
    contextFactory: toServiceContext,
  }))
  runtime.register(new PageDesignNodeTreeAiModule({
    service,
    contextFactory: toServiceContext,
    parentKind: PAGE_DESIGN_ROOT_KIND,
    payloads: [
      {
        payloadRef: PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
        description: 'SparkNode 组件 props 参数目录；LLM 写目录组件前必须显式 guidePayload，node-tree 写入时也会按 type 自动提取指南并兜底校验 props。',
        requiredForFunctions: ['addNode', 'addNodes', 'replaceNode', 'replaceNodes', 'setProps', 'setPropsBatch'],
      },
    ],
  }))
  runtime.register(new PageDesignDatasetAiModule({
    service,
    contextFactory: toServiceContext,
    parentKind: PAGE_DESIGN_ROOT_KIND,
  }))

  return {
    kindID: PAGE_DESIGN_MODULE_ID,
    name: 'Page Design',
    description: '页面 PageNode 生产线。',
    runtime,
    inputContract: {
      paramsSchema: PAGE_DESIGN_INPUT_SCHEMA,
      identityField: 'pageId',
      normalize: normalizePageDesignBusinessInput,
      toScope: (normalizedInput) => createAiAgentScope(PAGE_DESIGN_MODULE_ID, requirePageDesignInputText(normalizedInput, 'pageId')),
      toOrchestration: createPageDesignOrchestration,
    },
    sessionStore: new DefaultAiAgentSessionStore(),
    systemPrompt: createPageDesignSystemPrompt,
    onStartSession: (context) => {
      const bootstrap = service.bootstrap(toServiceContext(context))
      if (!bootstrap.ok) {
        throw new Error(bootstrap.msg)
      }
    },
    beforeFunctionCall: (call) => validatePageDesignCompletionRequest(options, call),
    afterFunctionCall: (call) => {
      const unavailableMessage = pageDesignEditHostUnavailableMessage(call.result)
      if (unavailableMessage !== null) {
        return {
          status: 'abort',
          reason: 'page design edit host unavailable',
          finalAssistantMessage: unavailableMessage,
          releaseInstance: true,
        }
      }
      return { status: 'continue' }
    },
    releaseModuleInstance: (moduleInstanceId) => {
      service.releasePage(moduleInstanceId)
    },
  }
}

function normalizePageDesignBusinessInput(input: AiJsonParams): PageDesignRunInput {
  const normalized: {
    pageId: string
    userRequirement: string
    mode?: PageDesignRunMode
    allowedOperations?: PageDesignAllowedOperations
    preserveExistingInteractions?: boolean
  } = {
    pageId: requirePageDesignInputText(input, 'pageId'),
    userRequirement: requirePageDesignInputText(input, 'userRequirement'),
  }
  const mode = input['mode']
  if (isPageDesignRunMode(mode)) normalized.mode = mode
  const allowedOperations = normalizeAllowedOperations(input['allowedOperations'])
  if (allowedOperations !== undefined) normalized.allowedOperations = allowedOperations
  const preserveExistingInteractions = input['preserveExistingInteractions']
  if (typeof preserveExistingInteractions === 'boolean') {
    normalized.preserveExistingInteractions = preserveExistingInteractions
  }
  return normalized
}

function createPageDesignOrchestration(
  input: PageDesignRunInput,
): SparkAiAgent.AiAgentOrchestrationPlan {
  const pageId = input.pageId
  const userRequirement = input.userRequirement
  const describeProgressCall = createPageDesignLifecycleToolCallText(pageId, 'describeProgress', {})
  const describeDesignFlowCall = createPageDesignLifecycleIntentToolCallText(pageId)
  return {
    title: 'pageDesign registered task orchestration',
    userMessage: userRequirement,
    systemPrompt: [
      '工具通道硬约束：所有 module_*、业务函数和完成动作必须通过 OpenAI function calling 的 tool_calls 发起；每次 assistant 响应的 tool_calls 数组长度必须为 1 且 assistant.content 为空；禁止在同一轮并行发起多个查询或写入；禁止在正文输出 {"tool_call":...}、module_call(...)、JSON 设计稿或代码块来代替工具调用。',
      `首轮只允许发起一个真实 tool_calls：function.name="module_find"，function.arguments=${JSON.stringify({
        path: '/',
        childKind: PAGE_DESIGN_ROOT_KIND,
        query: { id: pageId },
      })}。无正文；Host 返回 ref.id 后，每轮只调用一个真实 tool_call，按顺序调用 ${describeProgressCall} -> ${describeDesignFlowCall}。`,
      createPageDesign100StepOrchestrationPrompt(input),
    ].join('\n'),
    readonlySteps: createPageDesignReadonlySteps(input),
  }
}

function createPageDesignLifecycleToolCallText(
  pageId: string,
  functionName: 'describeProgress' | 'describeDesignFlow',
  args: AiJsonParams,
): string {
  return `${functionName}(${JSON.stringify({
    path: `/pageDesign[${pageId}]/lifecycle[${pageId}]`,
    args,
  })})`
}

function createPageDesignLifecycleIntentToolCallText(pageId: string): string {
  const path = `/pageDesign[${pageId}]/lifecycle[${pageId}]`
  return `describeDesignFlow({"path":${JSON.stringify(path)},"args":{"intent":messages[0].content}})`
}

function createPageDesign100StepOrchestrationPrompt(input: PageDesignRunInput): string {
  return [
    `阶段成果门禁：${createPageDesignFlowPhaseGateText()}。这些阶段是生产验收维度，不是固定脚本；围绕用户目标自行选择到达路径。`,
    '编排规则：依据用户需求、100 步流程事实、工具契约和每次工具结果自主推理下一步；模块不是绝对隔离的步骤盒子，可在推理过程中跨模块查询、写入和复核，把业务事实逐步沉淀到 PageNode。',
    'SSOT 规则：PageNode 是唯一真源；100 步只作为阶段检查和顺序决策；rule/pagedata/script/style 四文件只是最终编辑投影。',
    '路径规则：/pageDesign[id]/lifecycle[id] 管阶段检测和流程；/pageDesign[id]/<childKind>[id] 编辑 PageNode 子模型并投影到四文件。',
    '直接函数参数规则：业务函数 tool_call 的 function.name 必须是 addNodes/writeScript/writeStyle 等真实函数名；function.arguments 只能是 {"path":"/pageDesign[id]/<childKind>[id]","args":{...业务参数...}}；不要把 functionName 或业务参数放在 arguments 根层。',
    'PageNode 规则：最终成品按基类 navigation 与配置页内容 rule、dataSet、script、style 验收；navigation 已挂载时要维护标题、图标、描述、路径等页面属性。',
    '最小可验收门禁：新建页面最终必须形成 PageNode 闭环：导航属性（如已挂载）、业务数据模型、可见 UI 结构、页面服务脚本、页面样式。可以自行安排顺序，但关键成果完成前 agent_complete 会被业务门禁拒绝。',
    '标准件规则：管理台、信息维护、成绩管理、员工档案等常见页面优先选择 standard-page.buildManagementWorkbench 标准件；LLM 只抽取字段、筛选、指标、导航语义和动作，不手写函数内部逻辑或 Vue 组件细节。',
    '写入建议：通常先让数据事实支撑 UI，再补交互脚本和样式；若工具结果显示另一条路更稳，可以调整，但以最终验收通过为准。',
    '串行规则：任何响应最多发起一个 tool_call；不要把 module_query、payload-catalog、dataset、node-tree 或 text-model 调用放在同一个 tool_calls 数组里。',
    '完成规则：页面产物必须通过真实业务函数实际写入 PageNode 子模型并完成四文件投影；只在正文输出页面 JSON、设计说明或代码块不算完成。',
    '收尾规则：确认 PageNode 闭环和四文件投影完成并复核后，调用 agent_complete({ summary }) 申请收尾；如果门禁拒绝，读取 tool 结果中的缺口并继续修。',
    '知识规则：module_find 只返回实例，不返回函数表；首次调用 dataset/node-tree/text-model/payload-catalog 的具体函数前，必须先 module_query({ kind, includeFunctions:true }) 选真实函数，再 module_function_guide({ kind, functionName }) 消费函数契约。',
    '修复规则：FUNCTION_NOT_DECLARED / SCHEMA_VALIDATION_FAILED / ACTION_ERROR 后，先按 code/msg/fix/checks 回查 module_query/module_function_guide 或 payload-catalog.guidePayload，再重试；不要继续猜。',
    describePageDesignModeBoundary(input.mode),
    describePageDesignOperationBoundary(input.allowedOperations),
    input.preserveExistingInteractions === true ? '保留边界：保留现有页面交互、handler、组件 id 和数据绑定；修改前先盘点旧 rule/script。' : undefined,
    '缺业务事实时先 human_question；不要猜 API、字段、组件 props 或旧 DataViewKey。',
  ].filter((part): part is string => typeof part === 'string' && part.length > 0).join('\n')
}

function createPageDesignFlowPhaseGateText(): string {
  return summarizePageDesignFlowPhases()
    .map((phase) => {
      const range = phase.firstStep === phase.lastStep
        ? String(phase.firstStep)
        : `${phase.firstStep}-${phase.lastStep}`
      return `${phase.phase}(${range})`
    })
    .join(' -> ')
}

function describePageDesignModeBoundary(mode: PageDesignRunMode | undefined): string | undefined {
  if (mode === undefined) return undefined
  const messages: Record<PageDesignRunMode, string> = {
    create: '模式边界：mode=create，从步骤 1 开始建立新页面；仍需先盘点空白 PageNode，再数据优先。',
    modify: '模式边界：mode=modify，先完成步骤 11-20 盘点旧配置，再按相关阶段小步修改。',
    fix: '模式边界：mode=fix，先定位失败绑定或校验错误，再回到对应步骤修正并执行 97-100 复核。',
    data: '模式边界：mode=data，优先处理步骤 21-88；除非用户要求，不新增 UI 结构、脚本或样式。',
    style: '模式边界：mode=style，先读取 rule/style 事实，再聚焦步骤 96-100；不改数据模型。',
  }
  return messages[mode]
}

function describePageDesignOperationBoundary(allowedOperations: PageDesignAllowedOperations | undefined): string | undefined {
  if (allowedOperations === undefined) return undefined
  return [
    '操作边界：',
    `新增表=${formatAllowedOperation(allowedOperations.addTables)}`,
    `新增组件=${formatAllowedOperation(allowedOperations.addComponents)}`,
    `改脚本=${formatAllowedOperation(allowedOperations.editScript)}`,
    `改样式=${formatAllowedOperation(allowedOperations.editStyle)}`,
    '；禁止项必须通过 human_question 申请确认。',
  ].join('')
}

function formatAllowedOperation(value: boolean | undefined): string {
  if (value === true) return '允许'
  if (value === false) return '禁止'
  return '未声明'
}

function createPageDesignReadonlySteps(input: PageDesignRunInput): readonly string[] {
  const steps = [
      'find current pageDesign instance',
      'describeProgress',
      'describeDesignFlow with userRequirement intent',
      `follow 100-step phase gates: ${createPageDesignFlowPhaseGateText()}`,
      'human_question before guessing missing business facts',
  ]
  const modeBoundary = describePageDesignModeBoundary(input.mode)
  const operationBoundary = describePageDesignOperationBoundary(input.allowedOperations)
  return [
    ...steps,
    ...(modeBoundary === undefined ? [] : [modeBoundary]),
    ...(operationBoundary === undefined ? [] : [operationBoundary]),
    ...(input.preserveExistingInteractions === true ? ['preserve existing interactions before editing rule/script'] : []),
  ]
}

function requirePageDesignInputText(
  input: AiJsonParams,
  fieldName: 'pageId' | 'userRequirement',
): string {
  const value = input[fieldName]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`pageDesign input.${fieldName} must be a non-empty string.`)
  }
  return value.trim()
}

function isPageDesignRunMode(value: AiJsonValue | undefined): value is PageDesignRunMode {
  return typeof value === 'string' && PAGE_DESIGN_RUN_MODE_SET.has(value)
}

function normalizeAllowedOperations(value: AiJsonValue | undefined): PageDesignAllowedOperations | undefined {
  if (!isJsonParams(value)) return undefined
  const out: {
    addTables?: boolean
    addComponents?: boolean
    editScript?: boolean
    editStyle?: boolean
  } = {}
  const addTables = value['addTables']
  if (typeof addTables === 'boolean') out.addTables = addTables
  const addComponents = value['addComponents']
  if (typeof addComponents === 'boolean') out.addComponents = addComponents
  const editScript = value['editScript']
  if (typeof editScript === 'boolean') out.editScript = editScript
  const editStyle = value['editStyle']
  if (typeof editStyle === 'boolean') out.editStyle = editStyle
  return out
}

function isJsonParams(value: AiJsonValue | undefined): value is AiJsonParams {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
}

// ── System Prompt 组装 ─────────────────────────────────────

function createPageDesignSystemPrompt(): string {
  return AI_FUNCTION_ARCHITECTURE_PROMPT
}

// ── 根 AiModule 与实例发现 ───────────────────────────────

class PageDesignRootAiModule extends AiModule {
  public constructor() {
    super({
      kind: PAGE_DESIGN_ROOT_KIND,
      name: 'Page Design',
      description: '单页面 PageNode 生产线根模块。子模块直接提供 lifecycle、standard-page、text-model、payload-catalog、node-tree、dataset 能力。',
      children: PAGE_DESIGN_CHILD_MODULES.map((item) => item.kind),
      list: (ctx, childKind) => AiModuleResult.ok(childModuleRefs(ctx, childKind)),
      find: (ctx, childKind) => {
        if (childKind === PAGE_DESIGN_ROOT_KIND && ctx.segments.length === 0) {
          const ref = createCurrentPageDesignRef(ctx)
          return AiModuleResult.ok(ref === null ? [] : [ref])
        }
        return AiModuleResult.ok(childModuleRefs(ctx, childKind))
      },
    })
  }
}

function createCurrentPageDesignRef(ctx: AiModulePathContext): AiModuleInstanceRef | null {
  const pageId = pageDesignPageId(ctx)
  if (pageId === null) return null
  return {
    id: pageId,
    label: '当前页面设计业务',
    summary: 'PageDesign 根模块实例。',
  }
}

function childModuleRefs(ctx: AiModulePathContext, childKind?: string): readonly AiModuleInstanceRef[] {
  const pageId = pageDesignPageId(ctx)
  if (pageId === null) return []
  return PAGE_DESIGN_CHILD_MODULES
    .filter((item) => childKind === undefined || item.kind === childKind)
    .map((item) => ({
      id: pageId,
      label: item.label,
      summary: `${item.kind}: ${item.summary}`,
    }))
}

function pageDesignPageId(ctx: AiModulePathContext): string | null {
  const pageId = ctx.host?.moduleInstanceId ?? ctx.segment?.id
  return pageId === undefined || pageId.length === 0 ? null : pageId
}

// ── Host 上下文转换与生命周期错误映射 ─────────────────────

function toServiceContext(ctx: AiModulePathContext | SparkAiAgent.AiAgentRuntimeContext): PageDesignServiceContext {
  if ('host' in ctx || 'segments' in ctx) {
    const pathCtx = ctx
    return {
      requestId: pathCtx.host?.instanceId ?? pathCtx.segment?.id ?? '',
      pageId: pathCtx.host?.moduleInstanceId ?? pathCtx.segment?.id ?? '',
    }
  }
  return {
    requestId: ctx.instanceId,
    pageId: ctx.moduleInstanceId,
  }
}

function validatePageDesignCompletionRequest(
  options: PageDesignModuleOptions,
  call: SparkAiAgent.AiAgentBeforeFunctionCallOptions,
): SparkAiAgent.AiAgentBeforeFunctionCallDirective {
  if (call.toolName !== PAGE_DESIGN_COMPLETE_TOOL_NAME) return { status: 'allow' }
  const issues = inspectPageDesignDeliverable(options, call)
  if (issues.length === 0) return { status: 'allow' }
  return {
    status: 'reject',
    reason: 'pageDesign final deliverable is not ready',
    fix: [
      `最终验收未通过：${issues.join('；')}。`,
      '不要结束当前任务；请依据用户需求、100 步阶段、标准件和当前 PageNode 事实自行推理下一步。',
      '可以选择任意必要的 standard-page / dataset / node-tree / text-model / payload-catalog / lifecycle 函数修正成果，修好后再调用 agent_complete。',
    ].join(''),
  }
}

function inspectPageDesignDeliverable(
  options: PageDesignModuleOptions,
  context: SparkAiAgent.AiAgentRuntimeContext,
): string[] {
  const host = options.getEditToolHost({
    instanceId: context.instanceId,
    moduleId: PAGE_DESIGN_MODULE_ID,
    moduleInstanceId: context.moduleInstanceId,
  })
  return [...inspectPageDesignFinalIssues(host)]
}

function pageDesignEditHostUnavailableMessage(result: SparkAiAgent.AiAgentFunctionCallResult<unknown>): string | null {
  if (result.ok || (result.code !== 'EXECUTE_ERROR' && result.code !== 'ACTION_EXECUTE_ERROR')) return null
  const message = result.msg.trim()
  if (message === '') return null
  if (message.includes('PageDesign edit host unavailable')) return message
  if (message.includes('PageDesign edit host is not registered')) return '请先在开发系统中打开并选中目标配置页面。'
  if (message.includes('请先在开发系统中打开并选中目标配置页面')) return message
  return null
}

// ── 公共 Host 门面 ─────────────────────────────────────────

export type EnsurePageDesignBusinessOptions<TEntries extends SparkAiAgent.AiAgentHostEntryMap, TAlias extends string> = {
  readonly host: SparkAiAgent.AiAgentHost<TEntries>
  readonly alias?: TAlias
  readonly getPageDesignEditHost: (context: SparkAiAgent.AiAgentRuntimeContext) => PageDesignEditHost
}

export type PageDesignAiAgentEntry = Record<
  typeof PAGE_DESIGN_AI_AGENT_HOST_ALIAS,
  SparkAiAgent.AiAgentRegistration<PageDesignRunInput>
>

type PageDesignAiAgentEntryForAlias<TAlias extends string> = Record<
  TAlias,
  SparkAiAgent.AiAgentRegistration<PageDesignRunInput>
>

/**
 * 将 pageDesign 业务入口确保注册到 AI Host。
 * 调用方拿到返回值后即可使用 `host.run('pageDesign', { pageId, userRequirement })`。
 */
export function ensurePageDesignBusiness<TEntries extends SparkAiAgent.AiAgentHostEntryMap>(
  options: EnsurePageDesignBusinessOptions<TEntries, typeof PAGE_DESIGN_AI_AGENT_HOST_ALIAS>,
): SparkAiAgent.AiAgentHost<TEntries & PageDesignAiAgentEntry>
export function ensurePageDesignBusiness<TEntries extends SparkAiAgent.AiAgentHostEntryMap, TAlias extends string>(
  options: EnsurePageDesignBusinessOptions<TEntries, TAlias> & { readonly alias: TAlias },
): SparkAiAgent.AiAgentHost<TEntries & PageDesignAiAgentEntryForAlias<TAlias>>
export function ensurePageDesignBusiness<TEntries extends SparkAiAgent.AiAgentHostEntryMap, TAlias extends string>(
  options: EnsurePageDesignBusinessOptions<TEntries, TAlias>,
): SparkAiAgent.AiAgentHost<TEntries & PageDesignAiAgentEntryForAlias<TAlias | typeof PAGE_DESIGN_AI_AGENT_HOST_ALIAS>> {
  const alias = options.alias ?? PAGE_DESIGN_AI_AGENT_HOST_ALIAS
  return options.host.ensure(alias, {
    moduleId: PAGE_DESIGN_MODULE_ID,
    create: () => createPageDesignBusinessRegistration({
      getEditToolHost: (context) => options.getPageDesignEditHost(context),
    }),
  })
}
