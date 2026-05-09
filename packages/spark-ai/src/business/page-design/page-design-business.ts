import type { DataSetCrudTool } from '@spark-view/spark-data'
import {
  AiRuntime,
  AiInvocationProtocol,
  AiModuleRegistrationBase,
  type AiRegisteredModuleApi,
  type AiModuleRegistration,
  type AiFunctionRegistration,
  type AiRuntimeFunctionCallFailure,
  type AiRuntimeFunctionCallHistoryEntry,
  type AiRuntimeFunctionCallResult,
  type AiRuntimeFunctionCallTranslationResult,
  type AiRuntimeHistoryEntry,
  type AiRuntimeKnowledgeProjection,
  type AiRuntimeMessageHistoryEntry,
  type AiRuntimeMessageRole,
  type AiRuntimeMessageSource,
  type AiRuntimeSessionRecord,
  type AiRuntimeStartInstanceResult,
  type AiRuntimeStopInstanceResult,
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
import {
  PageDesignJsonDocCatalog,
  type JsonDocFunctionParameterRow,
} from './functions/json-doc/tool-catalog'
import { PageDesignComponentPayloadProvider } from './payloads/component-payload-provider'
import {
  resolvePointer,
  setAtPointer,
  deleteAtPointer,
  appendAtPointer,
  listAtPointer,
  type JsonValue,
} from './functions/json-doc/json-pointer'
import jmespath from 'jmespath'

const PAGE_DESIGN_MODULE_ID = 'pageDesign'
const LIFECYCLE_MODULE_ID = 'lifecycle'
const TEXT_MODEL_MODULE_ID = 'textModel'
const NODE_TREE_MODULE_ID = 'nodeTree'
const DATASET_MODULE_ID = 'dataset'
const JSON_DOC_MODULE_ID = 'jsonDoc'
const KNOWLEDGE_MODULE_ID = 'knowledge'
type PageDesignModuleId =
  | typeof LIFECYCLE_MODULE_ID
  | typeof TEXT_MODEL_MODULE_ID
  | typeof NODE_TREE_MODULE_ID
  | typeof DATASET_MODULE_ID
  | typeof JSON_DOC_MODULE_ID
  | typeof KNOWLEDGE_MODULE_ID
type PageDesignCatalogFunctionId = string
type PageDesignFunctionDefinition<TModuleId extends PageDesignModuleId> = AiFunctionRegistration & {
  readonly moduleId: TModuleId
  validate?(args: unknown, context: FunctionExecutionContext): string | null
  execute(args: unknown, context: FunctionExecutionContext): object | AiRuntimeFunctionCallResult<unknown> | Promise<object | AiRuntimeFunctionCallResult<unknown>>
}
const PAGE_DESIGN_LIFECYCLE_MODULE_PROMPT = 'lifecycle 模块只负责读取当前编辑运行状态、绑定宿主提供的 live adapter，并验证 nodeTree、dataset、script、style 能力齐全；bootstrap 不复制第二份页面事实，也不修改页面内容。'
const PAGE_DESIGN_TEXT_MODEL_MODULE_PROMPT = 'textModel 模块只读写 live script.js/style.css 文本模型；写入必须提交完整文件内容，script.js 遵守 sandbox API 边界，禁止 ESM import、window 全局和不可用 $page 伪 API。'
const PAGE_DESIGN_NODE_TREE_MODULE_PROMPT = 'nodeTree 模块只操作当前 live SparkNodeTree/rule.json 结构；构造或替换组件前必须先用 knowledge.queryPayloads 与 knowledge.guidePayload 查询合法 SparkNode schema，并使用真实 componentId/parentId。'
const PAGE_DESIGN_DATASET_MODULE_PROMPT = 'dataset 模块只操作当前 DataSetCrudTool/pagedata.json 数据空间；DataSet 是内存数据与视图配置，不是数据库，禁止套用 FK、索引、约束等 RDBMS 假设。'
const PAGE_DESIGN_KNOWLEDGE_MODULE_PROMPT = 'knowledge 模块暴露当前页面设计需要的只读知识查询能力；新增或替换 SparkNode 前先查询组件 payload，再按 guidePayload 返回的 JSON schema 构造 node。'

export interface PageDesignRuntimeContext {
  instanceId: string
  moduleId: typeof PAGE_DESIGN_MODULE_ID
  moduleInstanceId: string
}

export interface PageDesignModuleOptions {
  getEditToolHost: (context: PageDesignRuntimeContext) => EditToolHost
}

export type PageDesignServiceState = PageDesignEditSession

export interface PageDesignExecuteFunctionCallOptions extends PageDesignRuntimeContext {
  readonly action: string
  readonly args: unknown
  readonly projection?: AiRuntimeKnowledgeProjection | undefined
}

export interface PageDesignAppendMessageOptions extends PageDesignRuntimeContext {
  readonly role: AiRuntimeMessageRole
  readonly content: string
  readonly source?: AiRuntimeMessageSource | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export interface PageDesignStopSessionOptions extends PageDesignRuntimeContext {
  readonly reason?: string | undefined
}

function assertPageDesignContext(context: { readonly moduleId: string }): void {
  if (context.moduleId !== PAGE_DESIGN_MODULE_ID) {
    throw new Error(`PageDesign context moduleId must be ${PAGE_DESIGN_MODULE_ID}, got ${context.moduleId}`)
  }
}

type GetPageDesignState = (context: FunctionExecutionContext) => PageDesignEditSession

interface PageDesignModuleFactoryOptions<TModuleId extends PageDesignModuleId> {
  moduleId: TModuleId
  name: string
  description: string
  prompt: string
  getFunctionsFromHost: () => ReadonlyArray<PageDesignFunctionDefinition<TModuleId>>
}

type FunctionCatalogRow = {
  /** 模块内函数 ID；调用路径由 core 在会话投影时生成。 */
  functionId: PageDesignCatalogFunctionId
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema?: Record<string, unknown>
  usageRules?: readonly string[]
  failureModes?: readonly FunctionFailureMode[]
}

type MethodBackedRow = FunctionCatalogRow & {
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

function isFunctionCallResult(value: unknown): value is AiRuntimeFunctionCallResult<unknown> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false
  const candidate = value as Partial<AiRuntimeFunctionCallResult<unknown>>
  if (candidate.ok === true) {
    return 'data' in candidate && typeof candidate.summary === 'string'
  }
  if (candidate.ok === false) {
    return typeof candidate.code === 'string'
      && typeof candidate.msg === 'string'
      && typeof candidate.fix === 'string'
  }
  return false
}

function toObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function createBaseFunctionDefinition<
  TModuleId extends PageDesignModuleId,
>(row: FunctionCatalogRow, moduleId: TModuleId): Omit<PageDesignFunctionDefinition<TModuleId>, 'execute'> {
  return {
    moduleId,
    functionId: row.functionId,
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
      ? '已进入编辑态；按目标文件选择 nodeTree / dataset / textModel 函数。'
      : '请先执行 lifecycle.bootstrap 初始化编辑会话。',
  }
}

function bootstrapEditState(state: PageDesignEditSession): AiRuntimeFunctionCallResult<{ phase: PageDesignEditSession['phase'] }> {
  const tree = state.getActiveNodeTree()
  if (tree === null) {
    return failure('NO_NODE_TREE', 'lifecycle.bootstrap 失败：缺少 nodeTree tool 实例（EditToolHost.getNodeTree）', '宿主注入可用的 nodeTree tool 实例。')
  }

  const dataSetTool = state.getActiveDataSetTool()
  if (dataSetTool === null) {
    return failure('NO_DATASET_EDIT', 'lifecycle.bootstrap 失败：缺少 dataset tool 实例（EditToolHost.getDataSetTool）', '宿主注入可用的 dataset tool 实例。')
  }

  if (typeof state.toolHost?.readScript !== 'function' || typeof state.toolHost.readStyle !== 'function') {
    return failure('NO_TEXT_MODEL', 'lifecycle.bootstrap 失败：缺少 script/style 读取器', '宿主注入 EditToolHost.readScript/readStyle。')
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
    validate: (args) => catalog.validateParams(row.functionId, args),
    execute: (_args, context) => {
      const state = getState(context)
      if (row.functionId === 'bootstrap') {
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
      validate: (args) => catalog.validateParams(row.functionId, args),
      execute: (args, context) => {
        const state = getState(context)
        const accessError = ensureTextModelAccess(state, row, mode)
        if (accessError !== null) {
          return failure('NO_TEXT_MODEL', accessError, '请先执行 lifecycle.bootstrap 初始化编辑会话，并确保宿主绑定 EditToolHost.read*/write*。')
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
      return failure('METHOD_NOT_FOUND', `${row.functionId}: method "${methodName}" not found on target`, buildRowFixHint(row))
    }
    return success(invocation.data, `${row.functionId} 完成`)
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
    validate: (args) => catalog.validateParams(row.functionId, args),
    execute: (args, context) => {
      const state = getState(context)
      const tree: PageDesignNodeTree | null = state.getActiveNodeTree()
      if (tree === null) {
        return failure('NO_NODE_TREE', 'nodeTree 未初始化', '请先执行 lifecycle.bootstrap 初始化编辑会话。')
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
      validate: (args) => catalog.validateParams(row.functionId, args),
      execute: (args, context) => {
        const state = getState(context)
        const tool: DataSetCrudTool | null = state.getActiveDataSetTool()
        if (tool === null) {
          return failure('NO_DATASET_EDIT', 'datasetEdit 未初始化', '请先执行 lifecycle.bootstrap 初始化编辑会话。')
        }
        const result = callMethodBackedTarget(row, tool, row.crudToolMethod, args)
        if (result.ok && row.type === 'request') {
          state.notifyDataSetChanged(tool)
        }
        return result
      },
    }))
}

function createJsonDocFunctions(
  catalog: PageDesignJsonDocCatalog,
  getState: GetPageDesignState,
): ReadonlyArray<PageDesignFunctionDefinition<typeof JSON_DOC_MODULE_ID>> {
  return catalog.parameterTable.map((row: JsonDocFunctionParameterRow) => ({
    ...createBaseFunctionDefinition(row, JSON_DOC_MODULE_ID),
    validate: (args) => catalog.validateParams(row.functionId, args),
    execute: (args, context) => {
      const state = getState(context)
      // validateParams 已确保类型合法，直接解构
      const docType = (args as { docType: 'pagedata' | 'rule' }).docType

      const readDoc = state.toolHost?.readJsonDoc
      if (typeof readDoc !== 'function') {
        return failure('NO_JSON_DOC_HOST', '宿主未绑定 EditToolHost.readJsonDoc', '先执行 lifecycle.bootstrap 并确保宿主提供 readJsonDoc/writeJsonDoc。')
      }

      const rawDoc = readDoc.call(state.toolHost, docType)

      if (row.operation === 'read') {
        return success({ doc: rawDoc }, `${docType} 文档已读取`)
      }

      if (row.operation === 'list') {
        const pointer = (args as { pointer: string }).pointer
        const res = listAtPointer(rawDoc as JsonValue, pointer)
        if (!res.ok) return failure('NOT_FOUND', res.reason, '使用 jsonDoc.read 确认文档结构。')
        return success({ entries: res.entries }, `${docType}${pointer} 列出 ${res.entries.length} 个子节点`)
      }

      if (row.operation === 'get') {
        const pointer = (args as { pointer: string }).pointer
        const res = resolvePointer(rawDoc as JsonValue, pointer)
        if (!res.ok) return failure('NOT_FOUND', res.reason, '使用 jsonDoc.list 确认路径。')
        return success({ value: res.value }, `${docType}${pointer} 已读取`)
      }

      if (row.operation === 'query') {
        const queryArgs = args as { expression: string; pointer?: string }
        const pointer = queryArgs.pointer ?? ''
        let target: JsonValue = rawDoc as JsonValue
        if (pointer !== '') {
          const res = resolvePointer(target, pointer)
          if (!res.ok) return failure('NOT_FOUND', res.reason, '使用 jsonDoc.list 确认路径。')
          target = res.value
        }
        try {
          const result = jmespath.search(target, queryArgs.expression) as unknown
          return success({ result }, `JMESPath 查询完成`)
        } catch (e) {
          return failure('INVALID_EXPRESSION', `JMESPath 表达式错误: ${e instanceof Error ? e.message : String(e)}`, '检查 expression 语法，参考 https://jmespath.org。')
        }
      }

      // 写操作需要 writeJsonDoc
      const writeDoc = state.toolHost?.writeJsonDoc
      if (typeof writeDoc !== 'function') {
        return failure('NO_JSON_DOC_HOST', '宿主未绑定 EditToolHost.writeJsonDoc', '先执行 lifecycle.bootstrap 并确保宿主提供 writeJsonDoc。')
      }

      if (row.operation === 'set') {
        const setArgs = args as { pointer: string; value: JsonValue }
        const res = setAtPointer(rawDoc as JsonValue, setArgs.pointer, setArgs.value)
        if (!res.ok) return failure('INVALID_POINTER', res.reason, '检查 pointer 格式。')
        writeDoc.call(state.toolHost, docType, res.doc)
        return success(undefined, `${docType}${setArgs.pointer} 已设置`)
      }

      if (row.operation === 'delete') {
        const pointer = (args as { pointer: string }).pointer
        const res = deleteAtPointer(rawDoc as JsonValue, pointer)
        if (!res.ok) return failure('NOT_FOUND', res.reason, '使用 jsonDoc.list 确认路径后再删除。')
        writeDoc.call(state.toolHost, docType, res.doc)
        return success(undefined, `${docType}${pointer} 已删除`)
      }

      if (row.operation === 'append') {
        const appendArgs = args as { arrayPointer: string; element: JsonValue }
        const res = appendAtPointer(rawDoc as JsonValue, appendArgs.arrayPointer, appendArgs.element)
        if (!res.ok) return failure('NOT_ARRAY', res.reason, '使用 jsonDoc.get 确认目标是数组。')
        writeDoc.call(state.toolHost, docType, res.doc)
        return success(undefined, `元素已追加到 ${docType}${appendArgs.arrayPointer}`)
      }

      const patches = (args as { patches: Array<{ pointer: string; value: JsonValue }> }).patches
      let doc = rawDoc as JsonValue
      for (const [i, patch] of patches.entries()) {
        const res = setAtPointer(doc, patch.pointer, patch.value)
        if (!res.ok) return failure('INVALID_POINTER', `patches[${i}] 失败：${res.reason}`, '检查 pointer 格式，本批次全部未提交。')
        doc = res.doc
      }
      writeDoc.call(state.toolHost, docType, doc)
      return success(undefined, `${docType} 批量写入 ${patches.length} 项已完成`)
    },
  }))
}

function createKnowledgeFunctions(
  provider: PageDesignComponentPayloadProvider,
): ReadonlyArray<PageDesignFunctionDefinition<typeof KNOWLEDGE_MODULE_ID>> {
  return [
    {
      ...createBaseFunctionDefinition({
        functionId: 'queryPayloads',
        description: '查询 page-design 组件参数荷载目录，返回可用于 SparkNode node 参数的组件 type 摘要。',
        paramsSchema: {
          category: 'string? — 组件分类过滤，例如 container / field / group / meta。',
          keyword: 'string? — 按组件 type、描述或标签模糊搜索。',
        },
        resultSchema: {
          payloadRef: 'string — 固定为 page-design.component',
          items: 'KnowledgePayloadSummary[] — 组件参数荷载摘要列表。',
        },
        usageRules: [
          '新增或替换组件前，若不确定 type，先查询目录。',
          '无需传 payloadRef；本模块固定查询 page-design.component。',
        ],
        failureModes: [],
      }, KNOWLEDGE_MODULE_ID),
      execute: (args) => {
        const input = toObject(args) ?? {}
        const filter = {
          ...(typeof input['category'] === 'string' ? { category: input['category'] } : {}),
          ...(typeof input['keyword'] === 'string' ? { keyword: input['keyword'] } : {}),
        }
        const items = provider.queryPayloads(filter)
        return success({ payloadRef: provider.payloadRef, items }, `已返回 ${items.length} 个组件参数荷载摘要`)
      },
    },
    {
      ...createBaseFunctionDefinition({
        functionId: 'guidePayload',
        description: '读取指定组件 type 的 SparkNode 参数荷载指南，返回 JSON schema、最小示例和使用规则。',
        paramsSchema: {
          required: ['key'],
          key: 'string — 组件 type，例如 r-table、r-form、el-button。',
        },
        resultSchema: {
          guide: 'KnowledgePayloadGuide — 组件 SparkNode 参数荷载指南。',
        },
        usageRules: [
          '构造 nodeTree.addNode / replaceNode / addNodes / replaceNodes 的 node 参数前，必须先读取目标 type 的指南。',
          '返回 PAYLOAD_NOT_FOUND 时改用 queryPayloads 重新选择可用组件，不要反复用同一个缺失 key 重试。',
        ],
        failureModes: [
          {
            code: 'PAYLOAD_NOT_FOUND',
            when: 'key 不存在于 page-design.component 参数荷载目录。',
            fix: '先调用 knowledge.queryPayloads 选择可用组件 type。',
          },
        ],
      }, KNOWLEDGE_MODULE_ID),
      validate: (args) => {
        const input = toObject(args)
        if (input === null || typeof input['key'] !== 'string' || input['key'].trim().length === 0) {
          return 'key 必须是非空组件 type 字符串。'
        }
        return null
      },
      execute: (args) => {
        const key = (args as { key: string }).key
        const guide = provider.guidePayload(key)
        if (guide === null) {
          return failure(
            'PAYLOAD_NOT_FOUND',
            `组件 "${key}" 不在 page-design.component 参数荷载目录中`,
            '先调用 knowledge.queryPayloads 选择可用组件 type。',
          )
        }
        return success({ guide }, `${key} 组件参数荷载指南已返回`)
      },
    },
  ]
}

class PageDesignModuleRegistration<TModuleId extends PageDesignModuleId> extends AiModuleRegistrationBase {
  constructor(
    options: PageDesignModuleFactoryOptions<TModuleId>,
  ) {
    super(options.moduleId, options.name, options.description, options.prompt)
    this.getFunctionsFromHost = options.getFunctionsFromHost
  }

  private readonly getFunctionsFromHost: () => ReadonlyArray<PageDesignFunctionDefinition<TModuleId>>

  override getFunctions(): ReadonlyArray<PageDesignFunctionDefinition<TModuleId>> {
    return this.getFunctionsFromHost()
  }
}

export class PageDesignModule implements AiModuleRegistration {
  static readonly moduleId = PAGE_DESIGN_MODULE_ID

  readonly moduleId = PAGE_DESIGN_MODULE_ID

  readonly name = 'Page Design'

  readonly description = '单页面四文件编辑模块：rule.json、pagedata.json、script.js、style.css。'

  readonly modules: readonly AiModuleRegistration[]

  private readonly lifecycleCatalog = new PageDesignLifecycleCatalog()

  private readonly textModelCatalog = new PageDesignTextModelCatalog()

  private readonly nodeTreeCatalog = new PageDesignNodeTreeCatalog()

  private readonly datasetCatalog = new PageDesignDatasetCatalog()

  private readonly jsonDocCatalog = new PageDesignJsonDocCatalog()

  private readonly componentPayloadProvider = new PageDesignComponentPayloadProvider()

  private readonly states = new Map<string, PageDesignServiceState>()

  private readonly getEditToolHost: PageDesignModuleOptions['getEditToolHost']

  private readonly core = new AiRuntime()

  private readonly ai: AiRegisteredModuleApi

  constructor(options: PageDesignModuleOptions) {
    this.getEditToolHost = options.getEditToolHost
    this.modules = [
      new PageDesignModuleRegistration({
        moduleId: LIFECYCLE_MODULE_ID,
        name: 'Page Design Lifecycle',
        description: '页面设计编辑运行态引导与进度查询。',
        prompt: PAGE_DESIGN_LIFECYCLE_MODULE_PROMPT,
        getFunctionsFromHost: this.lifecycleFunctions,
      }),
      new PageDesignModuleRegistration({
        moduleId: TEXT_MODEL_MODULE_ID,
        name: 'Page Design Text Model',
        description: '当前页面 script.js/style.css live 文本模型读写。',
        prompt: PAGE_DESIGN_TEXT_MODEL_MODULE_PROMPT,
        getFunctionsFromHost: this.textModelFunctions,
      }),
      new PageDesignModuleRegistration({
        moduleId: KNOWLEDGE_MODULE_ID,
        name: 'Page Design Knowledge',
        description: '当前页面设计组件参数荷载知识查询。',
        prompt: PAGE_DESIGN_KNOWLEDGE_MODULE_PROMPT,
        getFunctionsFromHost: this.knowledgeFunctions,
      }),
      new PageDesignModuleRegistration({
        moduleId: NODE_TREE_MODULE_ID,
        name: 'Page Design Node Tree',
        description: '当前页面 SparkNodeTree/rule.json 结构读写。',
        prompt: PAGE_DESIGN_NODE_TREE_MODULE_PROMPT,
        getFunctionsFromHost: this.nodeTreeFunctions,
      }),
      new PageDesignModuleRegistration({
        moduleId: DATASET_MODULE_ID,
        name: 'Page Design DataSet',
        description: '当前页面 DataSetCrudTool/pagedata.json 数据空间读写。',
        prompt: PAGE_DESIGN_DATASET_MODULE_PROMPT,
        getFunctionsFromHost: this.datasetFunctions,
      }),
      new PageDesignModuleRegistration({
        moduleId: JSON_DOC_MODULE_ID,
        name: 'Page Design JSON Doc',
        description: '通过 JSON Pointer / JMESPath 直接读写 pagedata.json 或 rule.json 原始 JSON 文档。',
        prompt: 'jsonDoc 模块通过 RFC 6901 JSON Pointer 或 JMESPath 查询直接操作 pagedata/rule JSON 文档；read/list/get/query 只读，set/delete/append/setMultiple 写入时通过 EditToolHost.writeJsonDoc 提交；构造 JSON 前需先 read/get 理解结构，禁止凭空捏造路径。',
        getFunctionsFromHost: this.jsonDocFunctions,
      }),
    ]
    this.ai = this.core.registerModule(this)
  }

  async projectKnowledge(context: PageDesignRuntimeContext): Promise<AiRuntimeKnowledgeProjection> {
    assertPageDesignContext(context)
    return this.ai.projectModule({
      instanceId: context.instanceId,
      moduleInstanceId: context.moduleInstanceId,
      runtimeInstanceId: context.instanceId,
    })
  }

  async startSession(context: PageDesignRuntimeContext): Promise<AiRuntimeStartInstanceResult> {
    assertPageDesignContext(context)
    return this.ai.startInstance({
      instanceId: context.instanceId,
      moduleInstanceId: context.moduleInstanceId,
      runtimeInstanceId: context.instanceId,
    })
  }

  stopSession(options: PageDesignStopSessionOptions): AiRuntimeStopInstanceResult {
    assertPageDesignContext(options)
    return this.ai.stopInstance({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      ...(options.reason === undefined ? {} : { reason: options.reason }),
    })
  }

  appendMessage(options: PageDesignAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    assertPageDesignContext(options)
    return this.ai.appendMessage({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      runtimeInstanceId: options.instanceId,
      role: options.role,
      content: options.content,
      ...(options.source === undefined ? {} : { source: options.source }),
      ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    })
  }

  getSession(context: PageDesignRuntimeContext): AiRuntimeSessionRecord | null {
    assertPageDesignContext(context)
    return this.ai.getSessionByModuleInstance(context.moduleInstanceId)
  }

  getSessionHistory(context: PageDesignRuntimeContext): readonly AiRuntimeHistoryEntry[] {
    assertPageDesignContext(context)
    return this.ai.getSessionHistoryByModuleInstance(context.moduleInstanceId)
  }

  async translateFunctionCall(options: PageDesignExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallTranslationResult> {
    assertPageDesignContext(options)
    return this.ai.translateFunctionCall({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      runtimeInstanceId: options.instanceId,
      action: options.action,
      args: options.args,
      ...(options.projection === undefined ? {} : { projection: options.projection }),
    })
  }

  async executeFunctionCall(options: PageDesignExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>> {
    const translated = await this.translateFunctionCall(options)
    if (!translated.ok) {
      this.tryRecordFunctionCall(options, translated)
      return translated
    }

    const definition = translated.translation.functionRegistration as PageDesignFunctionDefinition<PageDesignModuleId>
    const requestEntry = this.recordFunctionCallRequest(translated.translation)
    const validationError = definition.validate?.(
      translated.translation.executionArgs,
      translated.translation.context,
    ) ?? null
    if (validationError !== null) {
      const failed = failure('INVALID_ARGS', validationError, `Fix args for ${options.action} before retrying.`)
      this.recordTranslatedFunctionCall(translated.translation, failed, requestEntry.id)
      return failed
    }

    try {
      const executed = await definition.execute(
        translated.translation.executionArgs,
        translated.translation.context,
      )
      const result: AiRuntimeFunctionCallResult<unknown> = isFunctionCallResult(executed) ? executed : {
        ok: true,
        data: executed,
        summary: `${options.action} executed`,
      }
      this.recordTranslatedFunctionCall(translated.translation, result, requestEntry.id)
      return result
    } catch (error) {
      const failed = failure(
        'EXECUTE_ERROR',
        AiInvocationProtocol.toErrorMessage(error),
        `Fix ${options.action} implementation or retry with valid args after checking page-design state.`,
      )
      this.recordTranslatedFunctionCall(translated.translation, failed, requestEntry.id)
      return failed
    }
  }

  private tryRecordFunctionCall(options: PageDesignExecuteFunctionCallOptions, error: AiRuntimeFunctionCallFailure): void {
    try {
      this.ai.appendFunctionCall({
        instanceId: options.instanceId,
        moduleInstanceId: options.moduleInstanceId,
        runtimeInstanceId: options.instanceId,
        action: options.action,
        args: options.args,
        status: 'failed',
        error,
      })
    } catch {
      // 翻译失败可能正是因为 session 不存在或已停止，此时不能再写入 session history。
    }
  }

  private recordTranslatedFunctionCall(
    translation: Extract<AiRuntimeFunctionCallTranslationResult, { ok: true }>['translation'],
    result: AiRuntimeFunctionCallResult<unknown>,
    historyEntryId: string,
  ): void {
    const resultMessage = this.ai.createFunctionResultMessage({
      action: translation.action,
      result,
    })
    this.ai.completeFunctionCall({
      instanceId: translation.context.instanceId,
      runtimeInstanceId: translation.context.runtimeInstanceId,
      moduleInstanceId: translation.context.moduleInstanceId,
      historyEntryId,
      status: result.ok ? 'completed' : 'failed',
      result,
      resultMessage,
      ...(!result.ok ? { error: result } : {}),
    })
  }

  private recordFunctionCallRequest(
    translation: Extract<AiRuntimeFunctionCallTranslationResult, { ok: true }>['translation'],
  ): AiRuntimeFunctionCallHistoryEntry {
    return this.ai.recordFunctionCallRequest({
      instanceId: translation.context.instanceId,
      runtimeInstanceId: translation.context.runtimeInstanceId,
      moduleInstanceId: translation.context.moduleInstanceId,
      action: translation.action,
      args: translation.rawArgs,
      modulePath: translation.context.modulePath,
      functionId: translation.context.functionId,
      activePath: translation.context.activePath,
    })
  }

  releaseModuleInstance(moduleInstanceId: string): void {
    this.states.delete(moduleInstanceId)
  }

  getFunctions(): readonly AiFunctionRegistration[] {
    return []
  }

  private readonly getState = (context: FunctionExecutionContext): PageDesignEditSession => {
    const existing = this.states.get(context.moduleInstanceId)
    if (existing !== undefined) return existing
    const state = new PageDesignEditSession()
    state.bindLiveModelAdapter(this.getEditToolHost({
      instanceId: context.instanceId,
      moduleId: PAGE_DESIGN_MODULE_ID,
      moduleInstanceId: context.moduleInstanceId,
    }))
    this.states.set(context.moduleInstanceId, state)
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

  private readonly knowledgeFunctions = (): ReadonlyArray<PageDesignFunctionDefinition<typeof KNOWLEDGE_MODULE_ID>> => {
    return createKnowledgeFunctions(this.componentPayloadProvider)
  }

  private readonly datasetFunctions = (): ReadonlyArray<PageDesignFunctionDefinition<typeof DATASET_MODULE_ID>> => {
    return createDatasetFunctions(this.datasetCatalog, this.getState)
  }

  private readonly jsonDocFunctions = (): ReadonlyArray<PageDesignFunctionDefinition<typeof JSON_DOC_MODULE_ID>> => {
    return createJsonDocFunctions(this.jsonDocCatalog, this.getState)
  }
}
