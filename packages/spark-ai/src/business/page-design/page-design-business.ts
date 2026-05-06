import type { DataSetCrudTool } from '@spark-view/spark-data'
import type { SparkNodeTree } from '@spark-view/spark-component'
import type {
  AiCoreFunctionCallResult,
  FunctionExecutionContext,
  IBusinessDefinition,
  IFunctionDefinition,
  IModule,
  ModulePromptContext,
  ModuleRuntime,
  ModuleRuntimeLifecycleContext,
} from '../../core'
import { parseActionAddress, toErrorMessage, invokeNamedMethod } from '../../core/protocol/invocation-helpers'
import {
  bindLiveModelAdapter,
  createEditState,
  getActiveDataSetTool,
  getActiveNodeTree,
  notifyDataSetChanged,
  notifyNodeTreeChanged,
  readActiveScript,
  readActiveStyle,
  writeActiveScript,
  writeActiveStyle,
  type EditState,
  type EditToolHost,
} from './functions/lifecycle/edit-lifecycle-functions'
import {
  EDIT_LIFECYCLE_FUNCTION_PARAMETER_TABLE,
  validateEditLifecycleFunctionParams,
} from './functions/lifecycle/tool-catalog'
import {
  TEXT_MODEL_FUNCTIONS_PARAMETER_TABLE,
  validateTextModelFunctionParams,
  type TextModelFunctionParameterRow,
} from './functions/text-model/tool-catalog'
import {
  SPARK_NODE_TREE_TOOL_PARAMETER_TABLE,
  validateSparkNodeTreeToolParams,
  type SparkNodeTreeToolParameterRow,
} from './functions/node-tree/tool-catalog'
import {
  DATASET_CRUD_TOOL_FUNCTIONS_PARAMETER_TABLE,
  validateDataSetCrudToolFunctionParams,
  type DatasetCrudToolFunctionParameterRow,
} from './functions/dataset/tool-catalog'

export const PAGE_DESIGN_BUSINESS = 'pageDesign'

const LIFECYCLE_MODULE_ID = 'lifecycle'
const TEXT_MODEL_MODULE_ID = 'textModel'
const NODE_TREE_MODULE_ID = 'nodeTree'
const DATASET_MODULE_ID = 'dataset'

const PAGE_DESIGN_LIFECYCLE_MODULE_PROMPT = 'pageDesign@lifecycle 只负责读取当前编辑运行状态、绑定宿主提供的 live adapter，并验证 nodeTree、dataset、script、style 能力齐全；bootstrap 不复制第二份页面事实，也不修改页面内容。'
const PAGE_DESIGN_TEXT_MODEL_MODULE_PROMPT = 'pageDesign@textModel 只读写 live script.js/style.css 文本模型；写入必须提交完整文件内容，script.js 遵守 sandbox API 边界，禁止 ESM import、window 全局和不可用 $page 伪 API。'
const PAGE_DESIGN_NODE_TREE_MODULE_PROMPT = 'pageDesign@nodeTree 只操作当前 live SparkNodeTree/rule.json 结构；构造或替换组件前必须先用 core@knowledge@queryPayloads/guidePayload 查询合法 SparkNode schema，并使用真实 componentId/parentId。'
const PAGE_DESIGN_DATASET_MODULE_PROMPT = 'pageDesign@dataset 只操作当前 DataSetCrudTool/pagedata.json 数据空间；DataSet 是内存数据与视图配置，不是数据库，禁止套用 FK、索引、约束等 RDBMS 假设。'

const HIDDEN_EDIT_DATASET_METHODS = new Set([
  'toJson',
  'listAggregates',
  'getAggregate',
  'addAggregate',
  'updateAggregate',
  'removeAggregate',
])

export interface PageDesignRuntimeContext {
  instanceId: string
  businessId: typeof PAGE_DESIGN_BUSINESS
}

export interface CreatePageDesignBusinessDefinitionOptions {
  getEditToolHost: (context: PageDesignRuntimeContext) => EditToolHost
}

export type PageDesignModuleRuntime = EditState & ModuleRuntime

interface PageDesignModuleFactoryOptions {
  moduleId: string
  name: string
  description: string
  prompt: string
  getFunctions: () => ReadonlyArray<IFunctionDefinition<unknown, unknown>>
  getInstance: (instanceId: string) => PageDesignModuleRuntime | null
  createRuntime: (context: ModulePromptContext) => PageDesignModuleRuntime
  destroyRuntime?: (runtime: PageDesignModuleRuntime, context: ModuleRuntimeLifecycleContext) => void
}

type FunctionCatalogRow = {
  action: string
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema?: Record<string, unknown>
  usageRules?: readonly string[]
  failureModes?: ReadonlyArray<{ code: string; when: string; fix: string }>
}

type MethodBackedRow = FunctionCatalogRow & {
  type: 'describe' | 'request'
  example: Record<string, unknown>
}

interface TextFileRuntime {
  label: string
  read(state: EditState): string
  write(state: EditState, content: string): void
  readMethod: keyof EditToolHost
  writeMethod: keyof EditToolHost
  validateWrite?: (content: string) => AiCoreFunctionCallResult<undefined> | null
}

const TEXT_FILE_RUNTIME_BY_KEY: Record<'script' | 'style', TextFileRuntime> = {
  script: {
    label: 'script.js',
    read: readActiveScript,
    write: writeActiveScript,
    readMethod: 'readScript',
    writeMethod: 'writeScript',
    validateWrite: validateScriptRuntimeContract,
  },
  style: {
    label: 'style.css',
    read: readActiveStyle,
    write: writeActiveStyle,
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

function validateScriptRuntimeContract(content: string): AiCoreFunctionCallResult<undefined> | null {
  const violation = FORBIDDEN_SCRIPT_API_RULES.find((rule) => rule.pattern.test(content))
  if (violation === undefined) return null
  return {
    ok: false,
    code: 'INVALID_SCRIPT_RUNTIME_API',
    msg: `script.js 使用了不可用的运行时 API：${violation.api}`,
    fix: `${violation.fix} $page 仅用于 showMessage/showConfirm/showPrompt/showAlert/showLoading/navigate 等页面服务；数据入口是 $dataSet，组件入口是 $components.getApi。`,
  }
}

function success<TResult>(data: TResult, summary: string): AiCoreFunctionCallResult<TResult> {
  return { ok: true, data, summary }
}

function failure(code: string, msg: string, fix: string): AiCoreFunctionCallResult<never> {
  return { ok: false, code, msg, fix }
}

function functionIdFromAction(action: string, expectedModuleId: string): string {
  const parsed = parseActionAddress(action)
  if (parsed.business !== PAGE_DESIGN_BUSINESS || parsed.module !== expectedModuleId) {
    throw new Error(`pageDesign 函数目录 action 与模块不一致: ${action}`)
  }
  return parsed.function
}

function createBaseFunctionDefinition(row: FunctionCatalogRow, moduleId: string): Omit<IFunctionDefinition<unknown, unknown>, 'execute'> {
  return {
    functionId: functionIdFromAction(row.action, moduleId),
    description: row.description,
    paramsSchema: row.paramsSchema,
    ...(row.resultSchema !== undefined ? { resultSchema: row.resultSchema } : {}),
    ...(row.usageRules !== undefined ? { usageRules: row.usageRules } : {}),
    ...(row.failureModes !== undefined ? { failureModes: row.failureModes } : {}),
  }
}

function isPageDesignRuntime(value: ModuleRuntime): value is PageDesignModuleRuntime {
  return 'phase' in value && 'toolHost' in value
}

function getRuntimeState(context: FunctionExecutionContext): EditState {
  if (!isPageDesignRuntime(context.moduleRuntime)) {
    throw new Error(`${context.action} 运行态不是 pageDesign EditState`)
  }
  return context.moduleRuntime
}

function describeProgress(state: EditState): Record<string, unknown> {
  return {
    phase: state.phase,
    adapters: {
      nodeTree: getActiveNodeTree(state) !== null,
      dataSet: getActiveDataSetTool(state) !== null,
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

function bootstrapEditState(state: EditState): AiCoreFunctionCallResult<{ phase: EditState['phase'] }> {
  const tree = getActiveNodeTree(state)
  if (tree === null) {
    return failure('NO_NODE_TREE', 'pageDesign@lifecycle@bootstrap 失败：缺少 nodeTree tool 实例（EditToolHost.getNodeTree）', '宿主注入可用的 nodeTree tool 实例。')
  }

  const dataSetTool = getActiveDataSetTool(state)
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

function createLifecycleFunctions(): ReadonlyArray<IFunctionDefinition<unknown, unknown>> {
  return EDIT_LIFECYCLE_FUNCTION_PARAMETER_TABLE.map((row) => ({
    ...createBaseFunctionDefinition(row, LIFECYCLE_MODULE_ID),
    validate: (args) => validateEditLifecycleFunctionParams(row.action, args),
    execute: (_args, context) => {
      const state = getRuntimeState(context)
      if (row.action === 'pageDesign@lifecycle@bootstrap') {
        return bootstrapEditState(state)
      }
      return success(describeProgress(state), `pageDesign 编辑状态：${state.phase}`)
    },
  }))
}

function ensureTextModelAccess(state: EditState, row: TextModelFunctionParameterRow, mode: 'read' | 'write'): string | null {
  const runtime = TEXT_FILE_RUNTIME_BY_KEY[row.fileKey]
  const method = mode === 'read' ? runtime.readMethod : runtime.writeMethod
  return typeof state.toolHost?.[method] === 'function' ? null : `缺少 live text model: ${String(method)}`
}

function createTextModelFunctions(): ReadonlyArray<IFunctionDefinition<unknown, unknown>> {
  return TEXT_MODEL_FUNCTIONS_PARAMETER_TABLE.map((row) => {
    const mode: 'read' | 'write' = row.type === 'describe' ? 'read' : 'write'
    const runtime = TEXT_FILE_RUNTIME_BY_KEY[row.fileKey]
    return {
      ...createBaseFunctionDefinition(row, TEXT_MODEL_MODULE_ID),
      validate: (args) => validateTextModelFunctionParams(String(row.action), args),
      execute: (args, context) => {
        const state = getRuntimeState(context)
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

function callMethodBackedTarget(row: MethodBackedRow, target: unknown, methodName: string, args: unknown): AiCoreFunctionCallResult<unknown> {
  try {
    const invocation = invokeNamedMethod(target, methodName, args)
    if (!invocation.ok) {
      return failure('METHOD_NOT_FOUND', `${row.action}: method "${methodName}" not found on target`, buildRowFixHint(row))
    }
    return success(invocation.data, `${row.action} 完成`)
  } catch (error) {
    return failure('EXECUTE_ERROR', toErrorMessage(error), buildRowFixHint(row))
  }
}

function createNodeTreeFunctions(): ReadonlyArray<IFunctionDefinition<unknown, unknown>> {
  return SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.map((row: SparkNodeTreeToolParameterRow) => ({
    ...createBaseFunctionDefinition(row, NODE_TREE_MODULE_ID),
    validate: (args) => validateSparkNodeTreeToolParams(String(row.action), args),
    execute: (args, context) => {
      const state = getRuntimeState(context)
      const tree: SparkNodeTree | null = getActiveNodeTree(state)
      if (tree === null) {
        return failure('NO_NODE_TREE', 'nodeTree 未初始化', '请先执行 pageDesign@lifecycle@bootstrap 初始化编辑会话。')
      }
      const result = callMethodBackedTarget(row, tree, row.coreMethod, args)
      if (result.ok && row.type === 'request') {
        notifyNodeTreeChanged(state, tree)
      }
      return result
    },
  }))
}

function createDatasetFunctions(): ReadonlyArray<IFunctionDefinition<unknown, unknown>> {
  return DATASET_CRUD_TOOL_FUNCTIONS_PARAMETER_TABLE
    .filter((row) => !HIDDEN_EDIT_DATASET_METHODS.has(row.crudToolMethod))
    .map((row: DatasetCrudToolFunctionParameterRow) => ({
      ...createBaseFunctionDefinition(row, DATASET_MODULE_ID),
      validate: (args) => validateDataSetCrudToolFunctionParams(String(row.action), args),
      execute: (args, context) => {
        const state = getRuntimeState(context)
        const tool: DataSetCrudTool | null = getActiveDataSetTool(state)
        if (tool === null) {
          return failure('NO_DATASET_EDIT', 'datasetEdit 未初始化', '请先执行 pageDesign@lifecycle@bootstrap 初始化编辑会话。')
        }
        const result = callMethodBackedTarget(row, tool, row.crudToolMethod, args)
        if (result.ok && row.type === 'request') {
          notifyDataSetChanged(state, tool)
        }
        return result
      },
    }))
}

function createPageDesignModule(options: PageDesignModuleFactoryOptions): IModule<PageDesignModuleRuntime> {
  return {
    moduleId: options.moduleId,
    name: options.name,
    description: options.description,
    createRuntime: options.createRuntime,
    ...(options.destroyRuntime !== undefined ? { destroyRuntime: options.destroyRuntime } : {}),
    getPrompt: () => options.prompt,
    getInstance: options.getInstance,
    getFunctions: options.getFunctions,
  }
}

export function createPageDesignBusinessDefinition(options: CreatePageDesignBusinessDefinitionOptions): IBusinessDefinition {
  const runtimes = new Map<string, PageDesignModuleRuntime>()

  function createLifecycleRuntime(context: ModulePromptContext): PageDesignModuleRuntime {
    const runtime = createEditState() as PageDesignModuleRuntime
    bindLiveModelAdapter(runtime, options.getEditToolHost({
      instanceId: context.instanceId,
      businessId: PAGE_DESIGN_BUSINESS,
    }))
    runtimes.set(context.instanceId, runtime)
    return runtime
  }

  function requireLifecycleRuntime(context: ModulePromptContext): PageDesignModuleRuntime {
    const runtime = runtimes.get(context.instanceId)
    if (runtime === undefined) {
      throw new Error(`pageDesign lifecycle runtime missing for instance ${context.instanceId}`)
    }
    return runtime
  }

  function destroyLifecycleRuntime(_runtime: PageDesignModuleRuntime, context: ModuleRuntimeLifecycleContext): void {
    runtimes.delete(context.instanceId)
  }

  function getRuntime(instanceId: string): PageDesignModuleRuntime | null {
    return runtimes.get(instanceId) ?? null
  }

  const modules: Array<IModule<PageDesignModuleRuntime>> = [
    createPageDesignModule({
      moduleId: LIFECYCLE_MODULE_ID,
      name: 'Page Design Lifecycle',
      description: '页面设计编辑运行态引导与进度查询。',
      prompt: PAGE_DESIGN_LIFECYCLE_MODULE_PROMPT,
      getInstance: getRuntime,
      createRuntime: createLifecycleRuntime,
      destroyRuntime: destroyLifecycleRuntime,
      getFunctions: createLifecycleFunctions,
    }),
    createPageDesignModule({
      moduleId: TEXT_MODEL_MODULE_ID,
      name: 'Page Design Text Model',
      description: '当前页面 script.js/style.css live 文本模型读写。',
      prompt: PAGE_DESIGN_TEXT_MODEL_MODULE_PROMPT,
      getInstance: getRuntime,
      createRuntime: requireLifecycleRuntime,
      getFunctions: createTextModelFunctions,
    }),
    createPageDesignModule({
      moduleId: NODE_TREE_MODULE_ID,
      name: 'Page Design Node Tree',
      description: '当前页面 SparkNodeTree/rule.json 结构读写。',
      prompt: PAGE_DESIGN_NODE_TREE_MODULE_PROMPT,
      getInstance: getRuntime,
      createRuntime: requireLifecycleRuntime,
      getFunctions: createNodeTreeFunctions,
    }),
    createPageDesignModule({
      moduleId: DATASET_MODULE_ID,
      name: 'Page Design DataSet',
      description: '当前页面 DataSetCrudTool/pagedata.json 数据空间读写。',
      prompt: PAGE_DESIGN_DATASET_MODULE_PROMPT,
      getInstance: getRuntime,
      createRuntime: requireLifecycleRuntime,
      getFunctions: createDatasetFunctions,
    }),
  ]

  return {
    businessId: PAGE_DESIGN_BUSINESS,
    name: 'Page Design',
    description: '单页面四文件编辑业务：rule.json、pagedata.json、script.js、style.css。',
    modules,
  }
}