import type { PageModelSessionHostRuntime } from '../../business/page-design/page-model-session-host'
import type { IStillSession, StillDefinition, StillResult } from '../../core/stills/types'
import type { JsonSchema } from '../../core/session/session-contracts'
import { stillToToolDefinition } from '../../core/fc-schema'
import { EDIT_STILLS, isEditWriteAction } from '../../business/page-design/stills'
import { PAGE_DESIGN_SCENARIO_SYSTEM_PROMPT } from '../engine/scenario-prompt-template-registry'
import type { AiScenarioRegistry } from '../engine/scenario-registry'
import type {
  AiScenarioCapability,
  AiScenarioContext,
  AiScenarioDefinition,
  AiScenarioFlowContract,
  AiScenarioStep,
  AiScenarioTool,
  AiScenarioToolRegistration,
} from '../engine/scenario-types'

export const PAGE_DESIGN_SCENARIO_ID = 'page-design.four-file-edit'

// 兼容业务域命名：页面设计是一个内置业务场景。
export const PAGE_DESIGN_BUSINESS_SCENARIO_ID = PAGE_DESIGN_SCENARIO_ID

export interface PageDesignScenarioStillEvent {
  still: StillDefinition
  args: unknown
  ctx: AiScenarioContext
  session: IStillSession
  result: StillResult
}

/**
 * 页面设计内置场景参数。
 *
 * 注意：这里不再接收手写的 readRule/writeRule 等抽象工具集。
 * 页面设计原有能力已经沉淀在 EDIT_STILLS 中，本工厂负责把这些 stills 注册为新框架工具。
 */
export interface CreatePageDesignScenarioOptions {
  id?: string
  title?: string
  intents?: readonly string[]
  systemPrompt?: string
  stills?: readonly StillDefinition[]
  includeActions?: readonly string[]
  excludeActions?: readonly string[]
  resolveSession: (ctx: AiScenarioContext) => IStillSession | Promise<IStillSession>
  beforeToolExecute?: (event: Omit<PageDesignScenarioStillEvent, 'result'>) => void | Promise<void>
  afterToolExecute?: (event: PageDesignScenarioStillEvent) => void | Promise<void>
}

export type CreatePageDesignBusinessScenarioOptions = CreatePageDesignScenarioOptions

const pageDesignPayloadSchema: JsonSchema = {
  type: 'object',
  properties: {
    userInput: { type: 'string', description: '用户对页面设计/修改的自然语言需求' },
    pageId: { type: 'string', description: '当前页面 ID' },
    projectId: { type: 'string', description: '可选：项目 ID' },
    moduleId: { type: 'string', description: '可选：模块 ID' },
    route: { type: 'string', description: '可选：当前页面路由' },
  },
  required: ['userInput'],
}

function getActionNamespace(action: string): string {
  return action.split('.')[0] ?? action
}

function getRequestId(ctx: AiScenarioContext, action: string): string {
  const requestId = ctx.metadata?.['requestId']
  if (typeof requestId === 'string' && requestId.trim() !== '') return requestId
  return `scenario:${action}:${Date.now()}`
}

function toFailureResult(code: string, msg: string, fix: string): StillResult {
  return { ok: false, code, msg, fix }
}

function runStillPostValidation(
  still: StillDefinition,
  session: IStillSession,
  args: unknown,
  result: StillResult
): StillResult {
  if (!result.ok || still.postValidate === undefined) return result

  const warnings = still.postValidate(session, args)
  if (warnings.length === 0) return result
  return {
    ...result,
    warnings,
  }
}

function appendPatchLog(still: StillDefinition, session: IStillSession, ctx: AiScenarioContext, result: StillResult): void {
  if (!result.ok || still.type !== 'request') return
  session.patchLog.push({
    action: still.action,
    requestId: getRequestId(ctx, still.action),
    timestamp: Date.now(),
    summary: result.summary,
  })
}

async function executeStillAsScenarioTool(
  still: StillDefinition,
  args: unknown,
  ctx: AiScenarioContext,
  options: CreatePageDesignScenarioOptions
): Promise<StillResult> {
  const session = await options.resolveSession(ctx)
  await options.beforeToolExecute?.({ still, args, ctx, session })

  const guardResult = still.guard?.(session) ?? null
  if (guardResult !== null) {
    const result = toFailureResult(
      guardResult.code,
      guardResult.msg,
      still.guardDescription ?? '请先满足工具前置条件后重试'
    )
    await options.afterToolExecute?.({ still, args, ctx, session, result })
    return result
  }

  const validationError = still.validate(args)
  if (validationError !== null) {
    const result = toFailureResult(
      'INVALID_PARAMS',
      validationError,
      `请按工具参数 Schema 和示例重新调用 ${still.action}`
    )
    await options.afterToolExecute?.({ still, args, ctx, session, result })
    return result
  }

  try {
    const rawResult = still.execute(session, args)
    const result = runStillPostValidation(still, session, args, rawResult)
    appendPatchLog(still, session, ctx, result)
    await options.afterToolExecute?.({ still, args, ctx, session, result })
    return result
  } catch (error) {
    const result = toFailureResult(
      'PAGE_DESIGN_TOOL_EXECUTE_FAILED',
      error instanceof Error ? error.message : String(error),
      `请查询 ${still.action} 的注册规则、参数 Schema 与失败提示后重试`
    )
    await options.afterToolExecute?.({ still, args, ctx, session, result })
    return result
  }
}

function toScenarioToolRegistration(still: StillDefinition): AiScenarioToolRegistration {
  const failureCodes = still.failureModes?.map((item) => item.code)
  const fixHints = still.failureModes?.map((item) => `${item.when}：${item.fix}`)
  const rules = [
    ...(still.guardDescription !== undefined ? [`前置条件：${still.guardDescription}`] : []),
    ...(still.usageRules ?? []),
  ]

  return {
    category: `page-design.${still.type}`,
    tags: [getActionNamespace(still.action), still.type],
    ...(still.example !== undefined ? { example: still.example } : {}),
    ...(rules.length > 0 ? { rules } : {}),
    ...(failureCodes !== undefined && failureCodes.length > 0 ? { failureCodes } : {}),
    ...(fixHints !== undefined && fixHints.length > 0 ? { fixHints } : {}),
  }
}

function toScenarioTool(still: StillDefinition, options: CreatePageDesignScenarioOptions): AiScenarioTool {
  const toolDefinition = stillToToolDefinition(still)
  return {
    name: still.action,
    description: toolDefinition.function.description,
    parameters: toolDefinition.function.parameters,
    registration: toScenarioToolRegistration(still),
    execute: (args, ctx) => executeStillAsScenarioTool(still, args, ctx, options),
  }
}

function filterStills(
  stills: readonly StillDefinition[],
  includeActions?: readonly string[],
  excludeActions?: readonly string[]
): readonly StillDefinition[] {
  const include = includeActions !== undefined ? new Set(includeActions) : undefined
  const exclude = excludeActions !== undefined ? new Set(excludeActions) : undefined
  return stills.filter((still) => {
    if (include?.has(still.action) === false) return false
    if (exclude?.has(still.action) === true) return false
    return true
  })
}

function buildDefaultPageDesignSteps(tools: readonly AiScenarioTool[]): (payload: unknown, ctx: AiScenarioContext) => readonly AiScenarioStep[] {
  const available = new Set(tools.map((tool) => tool.name))
  const inspectionSteps: readonly AiScenarioStep[] = [
    { id: 'bootstrap', title: '引导页面编辑会话', tool: 'edit.bootstrap', args: {}, critical: true },
    { id: 'read-rule', title: '读取 rule.json 节点树', tool: 'sparkNodeTree.getAllData', args: {} },
    { id: 'read-pagedata', title: '读取 pagedata.json 数据表目录', tool: 'datasetTool.listTables', args: {} },
    { id: 'read-script', title: '读取 script.js', tool: 'textModel.readScript', args: {} },
    { id: 'read-style', title: '读取 style.css', tool: 'textModel.readStyle', args: {} },
  ]
  return () => inspectionSteps.filter((step) => available.has(step.tool))
}

function listToolsByPrefix(tools: readonly AiScenarioTool[], prefix: string): string[] {
  return tools
    .map((tool) => tool.name)
    .filter((name) => name.startsWith(prefix))
}

function buildPageDesignCapabilities(tools: readonly AiScenarioTool[]): readonly AiScenarioCapability[] {
  const bootstrapTools = tools.filter((tool) => tool.name === 'edit.bootstrap').map((tool) => tool.name)
  const nodeTreeTools = listToolsByPrefix(tools, 'sparkNodeTree.')
  const datasetTools = listToolsByPrefix(tools, 'datasetTool.')
  const textModelTools = listToolsByPrefix(tools, 'textModel.')
  return [
    {
      id: 'page-design.bootstrap',
      title: '引导页面编辑上下文',
      kind: 'payload',
      description: '确认当前页面的 rule/pagedata/script/style live adapter 可用，进入页面编辑状态。',
      tags: ['page-design', 'bootstrap'],
      relatedTools: bootstrapTools,
      requiredPayloadKeys: ['userInput'],
    },
    {
      id: 'page-design.rule',
      title: '读取和修改 rule.json 节点树',
      kind: 'tool',
      description: '通过 sparkNodeTree.* 工具查询、插入、移动、替换、删除页面组件节点。',
      tags: ['page-design', 'rule', 'node-tree'],
      relatedTools: nodeTreeTools,
    },
    {
      id: 'page-design.pagedata',
      title: '读取和修改 pagedata.json 数据集',
      kind: 'tool',
      description: '通过 datasetTool.* 工具维护表、列、视图、行、关系、依赖和计算表达式。',
      tags: ['page-design', 'pagedata', 'dataset'],
      relatedTools: datasetTools,
    },
    {
      id: 'page-design.text-model',
      title: '读取和修改 script.js/style.css',
      kind: 'tool',
      description: '通过 textModel.* 工具读取和整文件写入 script.js 与 style.css。',
      tags: ['page-design', 'script', 'style'],
      relatedTools: textModelTools,
    },
    {
      id: 'page-design.completion',
      title: '依赖注册工具结果完成闭合检查',
      kind: 'completion',
      description: '页面设计的闭合检查由各工具 validate/postValidate、错误码和宿主投影同步结果共同完成。',
      tags: ['page-design', 'completion'],
      relatedTools: [
        ...nodeTreeTools.filter((name) => name.includes('get') || name.includes('list') || name.includes('count')),
        ...datasetTools.filter((name) => name.includes('list') || name.includes('get')),
        ...textModelTools.filter((name) => name.includes('read')),
      ],
    },
  ]
}

function buildPageDesignFlow(tools: readonly AiScenarioTool[]): AiScenarioFlowContract {
  const available = new Set(tools.map((tool) => tool.name))
  const nodeTreeWriteTools = tools
    .map((tool) => tool.name)
    .filter((name) => name.startsWith('sparkNodeTree.') && isEditWriteAction(name))
  const datasetWriteTools = tools
    .map((tool) => tool.name)
    .filter((name) => name.startsWith('datasetTool.') && isEditWriteAction(name))
  const textWriteTools = tools
    .map((tool) => tool.name)
    .filter((name) => name.startsWith('textModel.') && isEditWriteAction(name))

  return {
    description: '页面设计注册流程：先引导和读取事实，再按需求选择节点树、数据集、脚本、样式工具，闭合依赖工具返回和 postValidate。',
    steps: [
      {
        id: 'bootstrap',
        title: '引导页面编辑会话',
        kind: 'tool',
        tool: 'edit.bootstrap',
        args: {},
        critical: available.has('edit.bootstrap'),
      },
      {
        id: 'inspect',
        title: '读取页面四文件事实',
        kind: 'query',
        description: '按需读取 rule.json、pagedata.json、script.js、style.css，避免凭空修改。',
        tools: [
          ...(['sparkNodeTree.getAllData', 'datasetTool.listTables', 'textModel.readScript', 'textModel.readStyle']
            .filter((tool) => available.has(tool))),
        ],
        dependsOn: ['bootstrap'],
        critical: true,
      },
      {
        id: 'edit-rule',
        title: '按需修改 rule.json',
        kind: 'tool',
        description: '组件结构、属性、布局变化优先使用 sparkNodeTree.* 写工具。',
        tools: nodeTreeWriteTools,
        dependsOn: ['inspect'],
      },
      {
        id: 'edit-pagedata',
        title: '按需修改 pagedata.json',
        kind: 'tool',
        description: '数据表、列、视图、行、关系和依赖变化使用 datasetTool.* 写工具。',
        tools: datasetWriteTools,
        dependsOn: ['inspect'],
      },
      {
        id: 'edit-text-model',
        title: '按需修改 script.js/style.css',
        kind: 'tool',
        description: '脚本和样式全文修改使用 textModel.writeScript/textModel.writeStyle。',
        tools: textWriteTools,
        dependsOn: ['inspect'],
      },
      {
        id: 'completion',
        title: '读取结果并确认闭合',
        kind: 'completion',
        description: '通过注册的读取工具、写工具返回值、postValidate warnings 和宿主同步回调确认页面修改是否完成。',
        tools: [
          ...(['sparkNodeTree.getAllData', 'datasetTool.listTables', 'textModel.readScript', 'textModel.readStyle']
            .filter((tool) => available.has(tool))),
        ],
        dependsOn: ['edit-rule', 'edit-pagedata', 'edit-text-model'],
      },
    ],
  }
}

export function createPageDesignScenario(options: CreatePageDesignScenarioOptions): AiScenarioDefinition {
  const stills = filterStills(options.stills ?? EDIT_STILLS, options.includeActions, options.excludeActions)
  const tools = stills.map((still) => toScenarioTool(still, options))

  return {
    id: options.id ?? PAGE_DESIGN_SCENARIO_ID,
    title: options.title ?? '页面设计业务（四文件编辑）',
    scope: 'design',
    description: '把原页面设计 edit stills 注册为新 AI 引擎工具，覆盖 rule/pagedata/script/style 的读取、修改和工具级闭合检查。',
    intents: options.intents ?? ['页面设计', '四文件编辑', '修改页面', '页面模型编辑', '调整页面', '配置页面'],
    promptPolicy: {
      systemPrompt: options.systemPrompt ?? PAGE_DESIGN_SCENARIO_SYSTEM_PROMPT,
      confirmPolicy: 'critical-confirm',
      recoveryPolicy: 'layered',
    },
    capabilities: buildPageDesignCapabilities(tools),
    payload: {
      description: '页面设计业务载荷。具体修改参数不在场景层硬编码，必须按能力查询和工具 Schema 查询后组装。',
      schema: pageDesignPayloadSchema,
      required: ['userInput'],
      slots: [
        {
          key: 'userInput',
          label: '页面修改需求',
          description: '用户描述的页面设计或修改目标。',
          required: true,
          source: 'user',
          ...(pageDesignPayloadSchema.properties['userInput'] !== undefined ? { schema: pageDesignPayloadSchema.properties['userInput'] } : {}),
        },
        {
          key: 'pageId',
          label: '页面 ID',
          description: '当前页面标识，可从上下文注入；缺失时应由宿主或用户提供。',
          source: 'context',
          ...(pageDesignPayloadSchema.properties['pageId'] !== undefined ? { schema: pageDesignPayloadSchema.properties['pageId'] } : {}),
          askWhenMissing: '请确认要修改哪个页面。',
        },
      ],
    },
    flow: buildPageDesignFlow(tools),
    completion: {
      description: '页面设计不在引擎层硬编码完成条件；闭合依赖注册工具的 ok/error/warnings、写入 patchLog 和宿主同步回调。',
      tools: [
        ...(['sparkNodeTree.getAllData', 'datasetTool.listTables', 'textModel.readScript', 'textModel.readStyle']
          .filter((tool) => tools.some((item) => item.name === tool))),
      ],
      successSignals: ['写工具返回 ok=true', '无阻断型 error', 'postValidate 无需继续修复的 warnings', '宿主 onNodeTreeChanged/onDataSetChanged 或文本写入器已同步'],
      failureSignals: ['工具返回 ok=false', 'INVALID_PARAMS', 'NO_NODE_TREE', 'NO_DATASET_EDIT', 'NO_TEXT_MODEL', 'postValidate 返回必须关注的 warnings'],
    },
    recovery: [
      {
        code: 'INVALID_PARAMS',
        when: '工具参数不符合注册 Schema',
        hint: '调用 queryToolSchemaNode/queryToolRegistration 获取参数节点、示例和规则后重试。',
      },
      {
        code: 'NO_NODE_TREE',
        when: '节点树工具未初始化',
        hint: '先调用 edit.bootstrap，并确认宿主提供 EditToolHost.getNodeTree。',
        tools: ['edit.bootstrap'],
      },
      {
        code: 'NO_DATASET_EDIT',
        when: '数据集工具未初始化',
        hint: '先调用 edit.bootstrap，并确认宿主提供 EditToolHost.getDataSetTool。',
        tools: ['edit.bootstrap'],
      },
      {
        code: 'NO_TEXT_MODEL',
        when: 'script/style 文本模型读写器缺失',
        hint: '先调用 edit.bootstrap，并确认宿主提供 readScript/writeScript/readStyle/writeStyle。',
        tools: ['edit.bootstrap'],
      },
    ],
    tools,
    buildPayload: (ctx) => ({
      userInput: ctx.userInput,
      pageId: ctx.pageId,
      projectId: ctx.projectId,
      moduleId: ctx.moduleId,
      route: ctx.route,
      metadata: ctx.metadata ?? {},
    }),
    buildSteps: buildDefaultPageDesignSteps(tools),
    matchIntent: (input) => {
      const normalized = input.trim().toLowerCase()
      const score = ['页面', '四文件', 'rule', 'pagedata', 'script', 'style', '组件', '表单']
        .reduce((total, keyword) => total + (normalized.includes(keyword) ? keyword.length : 0), 0)
      return score > 0
        ? { matched: true, score, reason: '命中页面设计业务关键词' }
        : { matched: false, score: 0 }
    },
  }
}

export const createPageDesignBusinessScenario = createPageDesignScenario

export function registerPageDesignScenario(
  registry: AiScenarioRegistry,
  options: CreatePageDesignScenarioOptions
): AiScenarioDefinition {
  const scenario = createPageDesignScenario(options)
  registry.register(scenario)
  return scenario
}

export const registerPageDesignBusinessScenario = registerPageDesignScenario

export function isPageDesignScenarioWriteTool(toolName: string): boolean {
  return isEditWriteAction(toolName)
}

export const isPageDesignBusinessWriteTool = isPageDesignScenarioWriteTool


export interface CreatePageDesignBusinessScenarioFromSessionHostOptions extends Omit<CreatePageDesignBusinessScenarioOptions, 'resolveSession'> {
  sessionHost: PageModelSessionHostRuntime
}

export function createPageDesignBusinessScenarioFromSessionHost(
  options: CreatePageDesignBusinessScenarioFromSessionHostOptions
): AiScenarioDefinition {
  return createPageDesignBusinessScenario({
    ...options,
    resolveSession: () => options.sessionHost.ensureSession().session,
  })
}
