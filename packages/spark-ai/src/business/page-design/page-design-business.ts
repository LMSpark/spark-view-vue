import type { DataSetCrudTool } from '@spark-view/spark-data'
import {
  AiInvocationProtocol,
  type AiBusinessModuleRegistration,
  type AiBusinessRegistration,
  type AiFunctionRegistration,
  type AiRuntimeFunctionCallResult,
  type FunctionFailureMode,
  type FunctionExecutionContext,
} from '../../core'
import {
  PageDesignEditSession,
  type EditToolHost,
} from './functions/lifecycle/edit-lifecycle-functions'
import type { PageDesignNodeTree } from './functions/node-tree/types'
import {
  PageDesignLifecycleCatalog,
} from './functions/lifecycle/tool-catalog'
import {
  PageDesignTextModelCatalog,
  type TextModelFunctionParameterRow,
} from './functions/text-model/tool-catalog'
import {
  PageDesignNodeTreeCatalog,
  type SparkNodeTreeToolParameterRow,
} from './functions/node-tree/tool-catalog'
import {
  PageDesignDatasetCatalog,
  type DatasetCrudToolFunctionParameterRow,
} from './functions/dataset/tool-catalog'
import { isPageDesignDatasetMethodExposed } from './functions/dataset/edit-surface'

const PAGE_DESIGN_BUSINESS = 'pageDesign'
const LIFECYCLE_MODULE_ID = 'lifecycle'
const TEXT_MODEL_MODULE_ID = 'textModel'
const NODE_TREE_MODULE_ID = 'nodeTree'
const DATASET_MODULE_ID = 'dataset'
type PageDesignModuleId =
  | typeof LIFECYCLE_MODULE_ID
  | typeof TEXT_MODEL_MODULE_ID
  | typeof NODE_TREE_MODULE_ID
  | typeof DATASET_MODULE_ID
type PageDesignFunctionAction<TModuleId extends PageDesignModuleId = PageDesignModuleId> = `${typeof PAGE_DESIGN_BUSINESS}@${TModuleId}@${string}`
type PageDesignFunctionIdFromAction<TAction extends PageDesignFunctionAction> =
  TAction extends `${typeof PAGE_DESIGN_BUSINESS}@${PageDesignModuleId}@${infer TFunctionId}` ? TFunctionId : never
type PageDesignFunctionDefinition<
  TModuleId extends PageDesignModuleId,
  TAction extends PageDesignFunctionAction<TModuleId> = PageDesignFunctionAction<TModuleId>,
> = AiFunctionRegistration<
  unknown,
  unknown,
  typeof PAGE_DESIGN_BUSINESS,
  TModuleId,
  PageDesignFunctionIdFromAction<TAction>
> & {
  readonly action: TAction
  readonly moduleId: TModuleId
}
type PageDesignModuleDefinition<TModuleId extends PageDesignModuleId> = AiBusinessModuleRegistration<
  typeof PAGE_DESIGN_BUSINESS,
  TModuleId
>
type PageDesignAnyModuleDefinition = {
  [TModuleId in PageDesignModuleId]: PageDesignModuleDefinition<TModuleId>
}[PageDesignModuleId]
const PAGE_DESIGN_LIFECYCLE_MODULE_PROMPT = 'pageDesign@lifecycle 只负责读取当前编辑运行状态、绑定宿主提供的 live adapter，并验证 nodeTree、dataset、script、style 能力齐全；bootstrap 不复制第二份页面事实，也不修改页面内容。'
const PAGE_DESIGN_TEXT_MODEL_MODULE_PROMPT = 'pageDesign@textModel 只读写 live script.js/style.css 文本模型；写入必须提交完整文件内容，script.js 遵守 sandbox API 边界，禁止 ESM import、window 全局和不可用 $page 伪 API。'
const PAGE_DESIGN_NODE_TREE_MODULE_PROMPT = 'pageDesign@nodeTree 只操作当前 live SparkNodeTree/rule.json 结构；构造或替换组件前必须先用 core@knowledge@queryPayloads/guidePayload 查询合法 SparkNode schema，并使用真实 componentId/parentId。'
const PAGE_DESIGN_DATASET_MODULE_PROMPT = 'pageDesign@dataset 只操作当前 DataSetCrudTool/pagedata.json 数据空间；DataSet 是内存数据与视图配置，不是数据库，禁止套用 FK、索引、约束等 RDBMS 假设。'

export interface PageDesignRuntimeContext {
  instanceId: string
  businessId: typeof PAGE_DESIGN_BUSINESS
}

export interface PageDesignBusinessOptions {
  getEditToolHost: (context: PageDesignRuntimeContext) => EditToolHost
}

export type PageDesignServiceState = PageDesignEditSession

type GetPageDesignState = (context: FunctionExecutionContext) => PageDesignEditSession

interface PageDesignModuleFactoryOptions<TModuleId extends PageDesignModuleId> {
  moduleId: TModuleId
  name: string
  description: string
  prompt: string
  getFunctions: () => ReadonlyArray<PageDesignFunctionDefinition<TModuleId>>
}

type FunctionCatalogRow<TModuleId extends PageDesignModuleId = PageDesignModuleId> = {
  action: PageDesignFunctionAction<TModuleId>
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema?: Record<string, unknown>
  usageRules?: readonly string[]
  failureModes?: readonly FunctionFailureMode[]
}

type MethodBackedRow<TModuleId extends PageDesignModuleId = PageDesignModuleId> = FunctionCatalogRow<TModuleId> & {
  type: 'describe' | 'request'
  example: Record<string, unknown>
}

interface TextFileRuntime {
  label: string
  read(state: PageDesignEditSession): string
  write(state: PageDesignEditSession, content: string): void
  readMethod: keyof EditToolHost
  writeMethod: keyof EditToolHost
  validateWrite?: (content: string) => AiRuntimeFunctionCallResult<undefined> | null
}

const TEXT_FILE_RUNTIME_BY_KEY: Record<'script' | 'style', TextFileRuntime> = {
  script: {
    label: 'script.js',
    read: (state) => state.readActiveScript(),
    write: (state, content) => state.writeActiveScript(content),
    readMethod: 'readScript',
    writeMethod: 'writeScript',
    validateWrite: validateScriptRuntimeContract,
  },
  style: {
    label: 'style.css',
    read: (state) => state.readActiveStyle(),
    write: (state, content) => state.writeActiveStyle(content),
    readMethod: 'readStyle',
    writeMethod: 'writeStyle',
  },
}

interface ScriptApiViolationRule {
  pattern: RegExp
  api: string
  fix: string
}

const FORBIDDEN_SCRIPT_API_RULES: readonly ScriptApiViolationRule[] = [
  {
    pattern: /\$page\.(?:getDataSet|getTableRows|getTableData|getViewData)\s*\(/,
    api: '$page 数据读取伪 API',
    fix: '使用 $dataSet?.getView("TableName", "default")?.rows 读取 DataView 行数据。',
  },
  {
    pattern: /\$page\.(?:setFieldValue|getFieldValue|setFormData|getFormData|clearForm)\s*\(/,
    api: '$page 表单/字段伪 API',
    fix: '使用 $components.getApi("component-id") 获取表单组件 API，再调用 getFormData/setFieldValue/resetFields。',
  },
  {
    pattern: /\$page\.(?:createRow|updateRow|deleteRow|refreshTable)\s*\(/,
    api: '$page CRUD/表格伪 API',
    fix: '使用 $dataSet?.getView(...).appendRow/updateRowById/deleteRowById，或 $components.getApi("table-id")?.refresh()。',
  },
  {
    pattern: /\$page\.showDialog\s*\(\s*['"`]|\$page\.hideDialog\s*\(/,
    api: '$page 组件弹窗伪 API',
    fix: '使用 $components.getApi("dialog-id")?.open() / close() 控制 r-dialog。',
  },
  {
    pattern: /\$page\.confirm\s*\(/,
    api: '$page.confirm 伪 API',
    fix: '使用 await $page.showConfirm(message, title, options) 并根据 boolean 返回值继续处理。',
  },
  {
    pattern: /\.setSummaryRow\s*\(/,
    api: 'DataView.setSummaryRow 伪 API',
    fix: 'DataView.aggregateResult 由 aggregates 自动计算；不要在 script.js 中手动 setSummaryRow。',
  },
]

function validateScriptRuntimeContract(content: string): AiRuntimeFunctionCallResult<undefined> | null {
  const violation = FORBIDDEN_SCRIPT_API_RULES.find((rule) => rule.pattern.test(content))
  if (violation === undefined) return null
  return {
    ok: false,
    code: 'INVALID_SCRIPT_RUNTIME_API',
    msg: `script.js 使用了不可用的运行时 API：${violation.api}`,
    fix: `${violation.fix} $page 仅用于 showMessage/showConfirm/showPrompt/showAlert/showLoading/navigate 等页面服务；数据入口是 $dataSet，组件入口是 $components.getApi。`,
  }
}

function success<TResult>(data: TResult, summary: string): AiRuntimeFunctionCallResult<TResult> {
  return { ok: true, data, summary }
}

function failure(code: string, msg: string, fix: string): AiRuntimeFunctionCallResult<never> {
  return { ok: false, code, msg, fix }
}

function functionIdFromAction<
  TModuleId extends PageDesignModuleId,
  TAction extends PageDesignFunctionAction<TModuleId>,
>(action: TAction, expectedModuleId: TModuleId): PageDesignFunctionIdFromAction<TAction> {
  const parsed = AiInvocationProtocol.parseActionAddress(action)
  if (parsed.business !== PAGE_DESIGN_BUSINESS || parsed.module !== expectedModuleId) {
    throw new Error(`pageDesign 函数目录 action 与模块不一致: ${action}`)
  }
  return parsed.function as PageDesignFunctionIdFromAction<TAction>
}

function createBaseFunctionDefinition<
  TModuleId extends PageDesignModuleId,
  TAction extends PageDesignFunctionAction<TModuleId>,
>(row: FunctionCatalogRow<NoInfer<TModuleId>> & { action: TAction }, moduleId: TModuleId): Omit<PageDesignFunctionDefinition<TModuleId, TAction>, 'execute'> {
  return {
    action: row.action,
    moduleId,
    functionId: functionIdFromAction(row.action, moduleId),
    description: row.description,
    paramsSchema: row.paramsSchema,
    ...(row.resultSchema !== undefined ? { resultSchema: row.resultSchema } : {}),
    ...(row.usageRules !== undefined ? { usageRules: row.usageRules } : {}),
    ...(row.failureModes !== undefined ? { failureModes: row.failureModes } : {}),
  }
}

function describeProgress(state: PageDesignEditSession): Record<string, unknown> {
  return {
    phase: state.phase,
    adapters: {
      nodeTree: state.getActiveNodeTree() !== null,
      dataSet: state.getActiveDataSetTool() !== null,
      readScript: typeof state.toolHost?.readScript === 'function',
      writeScript: typeof state.toolHost?.writeScript === 'function',
      readStyle: typeof state.toolHost?.readStyle === 'function',
      writeStyle: typeof state.toolHost?.writeStyle === 'function',
    },
    nextStep: state.phase === 'editing'
      ? '已进入编辑态；按目标文件选择 pageDesign@nodeTree / pageDesign@dataset / pageDesign@textModel 函数。'
      : '请先执行 pageDesign@lifecycle@bootstrap 初始化编辑会话。',
  }
}

function bootstrapEditState(state: PageDesignEditSession): AiRuntimeFunctionCallResult<{ phase: PageDesignEditSession['phase'] }> {
  const tree = state.getActiveNodeTree()
  if (tree === null) {
    return failure('NO_NODE_TREE', 'pageDesign@lifecycle@bootstrap 失败：缺少 nodeTree tool 实例（EditToolHost.getNodeTree）', '宿主注入可用的 nodeTree tool 实例。')
  }

  const dataSetTool = state.getActiveDataSetTool()
  if (dataSetTool === null) {
    return failure('NO_DATASET_EDIT', 'pageDesign@lifecycle@bootstrap 失败：缺少 dataset tool 实例（EditToolHost.getDataSetTool）', '宿主注入可用的 dataset tool 实例。')
  }

  if (typeof state.toolHost?.readScript !== 'function' || typeof state.toolHost.readStyle !== 'function') {
    return failure('NO_TEXT_MODEL', 'pageDesign@lifecycle@bootstrap 失败：缺少 script/style 读取器', '宿主注入 EditToolHost.readScript/readStyle。')
  }

  tree.toJSON()
  dataSetTool.toJson()
  state.toolHost.readScript()
  state.toolHost.readStyle()
  state.phase = 'editing'
  return success({ phase: state.phase }, '编辑会话已完成函数引导（模型实例 + 函数入口），进入 editing 状态')
}

function createLifecycleFunctions(
  catalog: PageDesignLifecycleCatalog,
  getState: GetPageDesignState,
): ReadonlyArray<PageDesignFunctionDefinition<typeof LIFECYCLE_MODULE_ID>> {
  return catalog.parameterTable.map((row) => ({
    ...createBaseFunctionDefinition(row, LIFECYCLE_MODULE_ID),
    validate: (args) => catalog.validateParams(row.action, args),
    execute: (_args, context) => {
      const state = getState(context)
      if (row.action === 'pageDesign@lifecycle@bootstrap') {
        return bootstrapEditState(state)
      }
      return success(describeProgress(state), `pageDesign 编辑状态：${state.phase}`)
    },
  }))
}

function ensureTextModelAccess(state: PageDesignEditSession, row: TextModelFunctionParameterRow, mode: 'read' | 'write'): string | null {
  const runtime = TEXT_FILE_RUNTIME_BY_KEY[row.fileKey]
  const method = mode === 'read' ? runtime.readMethod : runtime.writeMethod
  return typeof state.toolHost?.[method] === 'function' ? null : `缺少 live text model: ${String(method)}`
}

function createTextModelFunctions(
  catalog: PageDesignTextModelCatalog,
  getState: GetPageDesignState,
): ReadonlyArray<PageDesignFunctionDefinition<typeof TEXT_MODEL_MODULE_ID>> {
  return catalog.parameterTable.map((row) => {
    const mode: 'read' | 'write' = row.type === 'describe' ? 'read' : 'write'
    const runtime = TEXT_FILE_RUNTIME_BY_KEY[row.fileKey]
    return {
      ...createBaseFunctionDefinition(row, TEXT_MODEL_MODULE_ID),
      validate: (args) => catalog.validateParams(row.action, args),
      execute: (args, context) => {
        const state = getState(context)
        const accessError = ensureTextModelAccess(state, row, mode)
        if (accessError !== null) {
          return failure('NO_TEXT_MODEL', accessError, '请先执行 pageDesign@lifecycle@bootstrap 初始化编辑会话，并确保宿主绑定 EditToolHost.read*/write*。')
        }

        if (mode === 'read') {
          return success({ content: runtime.read(state) }, `${runtime.label} 内容已返回`)
        }

        const content = (args as { content: string }).content
        const scriptContractError = runtime.validateWrite?.(content) ?? null
        if (scriptContractError !== null) return scriptContractError
        runtime.write(state, content)
        return success(undefined, `${runtime.label} 已更新`)
      },
    }
  })
}

interface InvocationMissingMethod {
  ok: false
  code: 'METHOD_NOT_FOUND'
  methodName: string
}

interface InvocationSucceeded {
  ok: true
  data: unknown
}

type InvocationResult = InvocationMissingMethod | InvocationSucceeded

function invokeNamedMethod(target: unknown, methodName: string, params: unknown): InvocationResult {
  const member: unknown = Reflect.get(target as object, methodName)
  if (typeof member !== 'function') {
    return {
      ok: false,
      code: 'METHOD_NOT_FOUND',
      methodName,
    }
  }

  const dispatch = member as (this: object, payload?: unknown) => unknown
  return {
    ok: true,
    data: dispatch.call(target as object, params),
  }
}

function buildRowFixHint(row: MethodBackedRow): string {
  const parts = [`参数格式: ${JSON.stringify(row.paramsSchema)}`]
  if (Object.keys(row.example).length > 0) {
    parts.push(`示例: ${JSON.stringify(row.example)}`)
  }
  if (row.usageRules !== undefined && row.usageRules.length > 0) {
    parts.push(`关键规则: ${row.usageRules.join('；')}`)
  }
  return parts.join('；')
}

function callMethodBackedTarget(row: MethodBackedRow, target: unknown, methodName: string, args: unknown): AiRuntimeFunctionCallResult<unknown> {
  try {
    const invocation = invokeNamedMethod(target, methodName, args)
    if (!invocation.ok) {
      return failure('METHOD_NOT_FOUND', `${row.action}: method "${methodName}" not found on target`, buildRowFixHint(row))
    }
    return success(invocation.data, `${row.action} 完成`)
  } catch (error) {
    return failure('EXECUTE_ERROR', AiInvocationProtocol.toErrorMessage(error), buildRowFixHint(row))
  }
}

function createNodeTreeFunctions(
  catalog: PageDesignNodeTreeCatalog,
  getState: GetPageDesignState,
): ReadonlyArray<PageDesignFunctionDefinition<typeof NODE_TREE_MODULE_ID>> {
  return catalog.parameterTable.map((row: SparkNodeTreeToolParameterRow) => ({
    ...createBaseFunctionDefinition(row, NODE_TREE_MODULE_ID),
    validate: (args) => catalog.validateParams(row.action, args),
    execute: (args, context) => {
      const state = getState(context)
      const tree: PageDesignNodeTree | null = state.getActiveNodeTree()
      if (tree === null) {
        return failure('NO_NODE_TREE', 'nodeTree 未初始化', '请先执行 pageDesign@lifecycle@bootstrap 初始化编辑会话。')
      }
      const result = callMethodBackedTarget(row, tree, row.coreMethod, args)
      if (result.ok && row.type === 'request') {
        state.notifyNodeTreeChanged(tree)
      }
      return result
    },
  }))
}

function createDatasetFunctions(
  catalog: PageDesignDatasetCatalog,
  getState: GetPageDesignState,
): ReadonlyArray<PageDesignFunctionDefinition<typeof DATASET_MODULE_ID>> {
  return catalog.parameterTable
    .filter((row) => isPageDesignDatasetMethodExposed(row.crudToolMethod))
    .map((row: DatasetCrudToolFunctionParameterRow) => ({
      ...createBaseFunctionDefinition(row, DATASET_MODULE_ID),
      validate: (args) => catalog.validateParams(row.action, args),
      execute: (args, context) => {
        const state = getState(context)
        const tool: DataSetCrudTool | null = state.getActiveDataSetTool()
        if (tool === null) {
          return failure('NO_DATASET_EDIT', 'datasetEdit 未初始化', '请先执行 pageDesign@lifecycle@bootstrap 初始化编辑会话。')
        }
        const result = callMethodBackedTarget(row, tool, row.crudToolMethod, args)
        if (result.ok && row.type === 'request') {
          state.notifyDataSetChanged(tool)
        }
        return result
      },
    }))
}

function createPageDesignModule<TModuleId extends PageDesignModuleId>(options: PageDesignModuleFactoryOptions<TModuleId>): PageDesignModuleDefinition<TModuleId> {
  return {
    moduleId: options.moduleId,
    name: options.name,
    description: options.description,
    prompt: options.prompt,
    getFunctions: options.getFunctions,
  }
}

export class PageDesignBusiness implements AiBusinessRegistration<typeof PAGE_DESIGN_BUSINESS> {
  static readonly businessId = PAGE_DESIGN_BUSINESS

  readonly businessId = PAGE_DESIGN_BUSINESS

  readonly name = 'Page Design'

  readonly description = '单页面四文件编辑业务：rule.json、pagedata.json、script.js、style.css。'

  readonly modules: readonly PageDesignAnyModuleDefinition[]

  private readonly lifecycleCatalog = new PageDesignLifecycleCatalog()

  private readonly textModelCatalog = new PageDesignTextModelCatalog()

  private readonly nodeTreeCatalog = new PageDesignNodeTreeCatalog()

  private readonly datasetCatalog = new PageDesignDatasetCatalog()

  private readonly states = new Map<string, PageDesignServiceState>()

  private readonly getEditToolHost: PageDesignBusinessOptions['getEditToolHost']

  constructor(options: PageDesignBusinessOptions) {
    this.getEditToolHost = options.getEditToolHost
    this.modules = [
      createPageDesignModule({
        moduleId: LIFECYCLE_MODULE_ID,
        name: 'Page Design Lifecycle',
        description: '页面设计编辑运行态引导与进度查询。',
        prompt: PAGE_DESIGN_LIFECYCLE_MODULE_PROMPT,
        getFunctions: this.lifecycleFunctions,
      }),
      createPageDesignModule({
        moduleId: TEXT_MODEL_MODULE_ID,
        name: 'Page Design Text Model',
        description: '当前页面 script.js/style.css live 文本模型读写。',
        prompt: PAGE_DESIGN_TEXT_MODEL_MODULE_PROMPT,
        getFunctions: this.textModelFunctions,
      }),
      createPageDesignModule({
        moduleId: NODE_TREE_MODULE_ID,
        name: 'Page Design Node Tree',
        description: '当前页面 SparkNodeTree/rule.json 结构读写。',
        prompt: PAGE_DESIGN_NODE_TREE_MODULE_PROMPT,
        getFunctions: this.nodeTreeFunctions,
      }),
      createPageDesignModule({
        moduleId: DATASET_MODULE_ID,
        name: 'Page Design DataSet',
        description: '当前页面 DataSetCrudTool/pagedata.json 数据空间读写。',
        prompt: PAGE_DESIGN_DATASET_MODULE_PROMPT,
        getFunctions: this.datasetFunctions,
      }),
    ] as const satisfies readonly PageDesignAnyModuleDefinition[]
  }

  releaseSession(context: { instanceId: string }): void {
    this.states.delete(context.instanceId)
  }

  private readonly getState = (context: FunctionExecutionContext): PageDesignEditSession => {
    const existing = this.states.get(context.instanceId)
    if (existing !== undefined) return existing
    const state = new PageDesignEditSession()
    state.bindLiveModelAdapter(this.getEditToolHost({
      instanceId: context.instanceId,
      businessId: PAGE_DESIGN_BUSINESS,
    }))
    this.states.set(context.instanceId, state)
    return state
  }

  private readonly lifecycleFunctions = (): ReadonlyArray<PageDesignFunctionDefinition<typeof LIFECYCLE_MODULE_ID>> => {
    return createLifecycleFunctions(this.lifecycleCatalog, this.getState)
  }

  private readonly textModelFunctions = (): ReadonlyArray<PageDesignFunctionDefinition<typeof TEXT_MODEL_MODULE_ID>> => {
    return createTextModelFunctions(this.textModelCatalog, this.getState)
  }

  private readonly nodeTreeFunctions = (): ReadonlyArray<PageDesignFunctionDefinition<typeof NODE_TREE_MODULE_ID>> => {
    return createNodeTreeFunctions(this.nodeTreeCatalog, this.getState)
  }

  private readonly datasetFunctions = (): ReadonlyArray<PageDesignFunctionDefinition<typeof DATASET_MODULE_ID>> => {
    return createDatasetFunctions(this.datasetCatalog, this.getState)
  }
}
