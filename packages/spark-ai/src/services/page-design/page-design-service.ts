import type { DataSetCrudTool } from '@spark-view/spark-data'
import {
  PageDesignEditSession,
  type PageDesignEditHost,
} from './edit-session'
import type { PageDesignNodeTree } from './node-tree-types'
import {
  resolvePointer,
  setAtPointer,
  deleteAtPointer,
  appendAtPointer,
  listAtPointer,
  type JsonValue,
} from './json-doc-json-pointer'
import jmespath from 'jmespath'

export interface PageDesignServiceContext {
  requestId: string
  pageId: string
}

export interface PageDesignServiceOptions {
  getEditHost: (context: PageDesignServiceContext) => PageDesignEditHost
}

export type PageDesignServiceState = PageDesignEditSession
export type PageDesignServiceResult<TResult> =
  | { ok: true; data: TResult; summary: string }
  | { ok: false; code: string; msg: string; fix: string }

interface PageDesignTextFileBinding {
  label: string
  read(state: PageDesignEditSession): string
  write(state: PageDesignEditSession, content: string): void
  readMethod: keyof PageDesignEditHost
  writeMethod: keyof PageDesignEditHost
  validateWrite?: (content: string) => PageDesignServiceResult<undefined> | null
}

const TEXT_FILE_BINDING_BY_KEY: Record<'script' | 'style', PageDesignTextFileBinding> = {
  script: {
    label: 'script.js',
    read: (state) => state.readActiveScript(),
    write: (state, content) => state.writeActiveScript(content),
    readMethod: 'readScript',
    writeMethod: 'writeScript',
    validateWrite: validateScriptServiceContract,
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

function validateScriptServiceContract(content: string): PageDesignServiceResult<undefined> | null {
  const violation = FORBIDDEN_SCRIPT_API_RULES.find((rule) => rule.pattern.test(content))
  if (violation === undefined) return null
  return {
    ok: false,
    code: 'INVALID_SCRIPT_RUNTIME_API',
    msg: `script.js 使用了不可用的运行时 API：${violation.api}`,
    fix: `${violation.fix} $page 仅用于 showMessage/showConfirm/showPrompt/showAlert/showLoading/navigate 等页面服务；数据入口是 $dataSet，组件入口是 $components.getApi。`,
  }
}

function success<TResult>(data: TResult, summary: string): PageDesignServiceResult<TResult> {
  return { ok: true, data, summary }
}

export function pageDesignServiceFailure(code: string, msg: string, fix: string): PageDesignServiceResult<never> {
  return { ok: false, code, msg, fix }
}

export function isPageDesignServiceResult(value: unknown): value is PageDesignServiceResult<unknown> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false
  const candidate = value as Partial<PageDesignServiceResult<unknown>>
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

function describeProgress(state: PageDesignEditSession): Record<string, unknown> {
  return {
    phase: state.phase,
    bindings: {
      nodeTree: state.getActiveNodeTree() !== null,
      dataSet: state.getActiveDataSetTool() !== null,
      readScript: typeof state.host?.readScript === 'function',
      writeScript: typeof state.host?.writeScript === 'function',
      readStyle: typeof state.host?.readStyle === 'function',
      writeStyle: typeof state.host?.writeStyle === 'function',
    },
    nextStep: state.phase === 'editing'
      ? '已进入编辑态；按目标文件调用对应的 PageDesignService 方法。'
      : '请先调用 PageDesignService.bootstrap 初始化编辑会话。',
  }
}

function bootstrapEditState(state: PageDesignEditSession): PageDesignServiceResult<{ phase: PageDesignEditSession['phase'] }> {
  const tree = state.getActiveNodeTree()
  if (tree === null) {
    return pageDesignServiceFailure('NO_NODE_TREE', 'PageDesignService.bootstrap 失败：缺少 nodeTree 实例（PageDesignEditHost.getNodeTree）', '宿主注入可用的 nodeTree 实例。')
  }

  const dataSetTool = state.getActiveDataSetTool()
  if (dataSetTool === null) {
    return pageDesignServiceFailure('NO_DATASET_EDIT', 'PageDesignService.bootstrap 失败：缺少 dataset 实例（PageDesignEditHost.getDataSetTool）', '宿主注入可用的 dataset 实例。')
  }

  if (typeof state.host?.readScript !== 'function' || typeof state.host.readStyle !== 'function') {
    return pageDesignServiceFailure('NO_TEXT_MODEL', 'PageDesignService.bootstrap 失败：缺少 script/style 读取器', '宿主注入 PageDesignEditHost.readScript/readStyle。')
  }

  tree.toJSON()
  dataSetTool.toJson()
  state.host.readScript()
  state.host.readStyle()
  state.phase = 'editing'
  return success({ phase: state.phase }, '编辑会话已完成宿主检查，进入 editing 状态')
}

function ensureTextModelAccess(
  state: PageDesignEditSession,
  fileKey: 'script' | 'style',
  mode: 'read' | 'write',
): string | null {
  const binding = TEXT_FILE_BINDING_BY_KEY[fileKey]
  const method = mode === 'read' ? binding.readMethod : binding.writeMethod
  return typeof state.host?.[method] === 'function' ? null : `缺少 live text model: ${String(method)}`
}

interface TargetMethodMissing {
  ok: false
  code: 'METHOD_NOT_FOUND'
  methodName: string
}

interface TargetMethodSucceeded {
  ok: true
  data: unknown
}

type TargetMethodResult = TargetMethodMissing | TargetMethodSucceeded

function useNamedMethod(target: unknown, methodName: string, params: unknown): TargetMethodResult {
  const member: unknown = Reflect.get(target as object, methodName)
  if (typeof member !== 'function') {
    return {
      ok: false,
      code: 'METHOD_NOT_FOUND',
      methodName,
    }
  }

  const method = member as (this: object, params?: unknown) => unknown
  return {
    ok: true,
    data: method.apply(target as object, [params]),
  }
}

function toSerializableServiceData(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (typeof (value as { toJson?: unknown }).toJson === 'function') {
    return toSerializableServiceData((value as { toJson: () => unknown }).toJson())
  }
  if (Array.isArray(value)) return value.map(toSerializableServiceData)

  const seen = new WeakSet<object>()
  const serialized = JSON.stringify(value, (_key, nested: unknown) => {
    if (typeof nested === 'bigint') return nested.toString()
    if (nested === null || typeof nested !== 'object') return nested
    if (typeof (nested as { toJson?: unknown }).toJson === 'function') {
      return toSerializableServiceData((nested as { toJson: () => unknown }).toJson())
    }
    if (seen.has(nested)) return '[Circular]'
    seen.add(nested)
    return nested
  })
  return JSON.parse(serialized)
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function useMethodBackedTarget(options: PageDesignServiceMethodBinding, target: unknown, args: unknown): PageDesignServiceResult<unknown> {
  try {
    const targetMethod = useNamedMethod(target, options.methodName, args)
    if (!targetMethod.ok) {
      return pageDesignServiceFailure('METHOD_NOT_FOUND', `${options.serviceLabel}: method "${options.methodName}" not found on target`, options.fixHint ?? '确认宿主对象实现了对应方法。')
    }
    return success(toSerializableServiceData(targetMethod.data), `${options.serviceLabel} 完成`)
  } catch (error) {
    return pageDesignServiceFailure('METHOD_ERROR', toErrorMessage(error), options.fixHint ?? '检查输入参数和宿主方法实现。')
  }
}

export type PageDesignTextFileKey = 'script' | 'style'

export type PageDesignJsonDocOperation =
  | 'read'
  | 'list'
  | 'get'
  | 'set'
  | 'delete'
  | 'append'
  | 'setMultiple'
  | 'query'

export interface PageDesignServiceMethodBinding {
  serviceLabel: string
  methodName: string
  mutates: boolean
  fixHint?: string
}

export class PageDesignService {
  private readonly states = new Map<string, PageDesignServiceState>()

  private readonly getEditHost: PageDesignServiceOptions['getEditHost']

  constructor(options: PageDesignServiceOptions) {
    this.getEditHost = options.getEditHost
  }

  getState(context: PageDesignServiceContext): PageDesignEditSession {
    const existing = this.states.get(context.pageId)
    if (existing !== undefined) return existing
    const state = new PageDesignEditSession()
    state.bindHost(this.getEditHost(context))
    this.states.set(context.pageId, state)
    return state
  }

  bootstrap(context: PageDesignServiceContext): PageDesignServiceResult<{ phase: PageDesignEditSession['phase'] }> {
    return bootstrapEditState(this.getState(context))
  }

  describeProgress(context: PageDesignServiceContext): PageDesignServiceResult<Record<string, unknown>> {
    const state = this.getState(context)
    return success(describeProgress(state), `pageDesign 编辑状态：${state.phase}`)
  }

  readTextModel(context: PageDesignServiceContext, fileKey: PageDesignTextFileKey): PageDesignServiceResult<{ content: string }> {
    const state = this.getState(context)
    const binding = TEXT_FILE_BINDING_BY_KEY[fileKey]
    const accessError = ensureTextModelAccess(state, fileKey, 'read')
    if (accessError !== null) {
      return pageDesignServiceFailure('NO_TEXT_MODEL', accessError, '请先调用 PageDesignService.bootstrap 初始化编辑会话，并确保宿主绑定 PageDesignEditHost.read*/write*。')
    }
    return success({ content: binding.read(state) }, `${binding.label} 内容已返回`)
  }

  writeTextModel(context: PageDesignServiceContext, fileKey: PageDesignTextFileKey, content: string): PageDesignServiceResult<undefined> {
    const state = this.getState(context)
    const binding = TEXT_FILE_BINDING_BY_KEY[fileKey]
    const accessError = ensureTextModelAccess(state, fileKey, 'write')
    if (accessError !== null) {
      return pageDesignServiceFailure('NO_TEXT_MODEL', accessError, '请先调用 PageDesignService.bootstrap 初始化编辑会话，并确保宿主绑定 PageDesignEditHost.read*/write*。')
    }
    const scriptContractError = binding.validateWrite?.(content) ?? null
    if (scriptContractError !== null) return scriptContractError
    binding.write(state, content)
    return success(undefined, `${binding.label} 已更新`)
  }

  useNodeTreeMethod(
    context: PageDesignServiceContext,
    args: unknown,
    options: PageDesignServiceMethodBinding,
  ): PageDesignServiceResult<unknown> {
    const state = this.getState(context)
    const tree: PageDesignNodeTree | null = state.getActiveNodeTree()
    if (tree === null) {
      return pageDesignServiceFailure('NO_NODE_TREE', 'nodeTree 未初始化', '请先调用 PageDesignService.bootstrap 初始化编辑会话。')
    }
    const result = useMethodBackedTarget(options, tree, args)
    if (result.ok && options.mutates) {
      state.notifyNodeTreeChanged(tree)
    }
    return result
  }

  useDatasetMethod(
    context: PageDesignServiceContext,
    args: unknown,
    options: PageDesignServiceMethodBinding,
  ): PageDesignServiceResult<unknown> {
    const state = this.getState(context)
    const tool: DataSetCrudTool | null = state.getActiveDataSetTool()
    if (tool === null) {
      return pageDesignServiceFailure('NO_DATASET_EDIT', 'dataset 未初始化', '请先调用 PageDesignService.bootstrap 初始化编辑会话。')
    }
    const result = useMethodBackedTarget(options, tool, args)
    if (result.ok && options.mutates) {
      state.notifyDataSetChanged(tool)
    }
    return result
  }

  useJsonDocOperation(
    context: PageDesignServiceContext,
    args: unknown,
    operation: PageDesignJsonDocOperation,
  ): PageDesignServiceResult<unknown> {
    const state = this.getState(context)
    const docType = (args as { docType: 'pagedata' | 'rule' }).docType

    const host = state.host
    const readDoc = host?.readJsonDoc
    if (typeof readDoc !== 'function') {
      return pageDesignServiceFailure('NO_JSON_DOC_HOST', '宿主未绑定 PageDesignEditHost.readJsonDoc', '先调用 PageDesignService.bootstrap 并确保宿主提供 readJsonDoc/writeJsonDoc。')
    }

    const rawDoc = readDoc(docType)

    if (operation === 'read') {
      return success({ doc: rawDoc }, `${docType} 文档已读取`)
    }

    if (operation === 'list') {
      const pointer = (args as { pointer: string }).pointer
      const res = listAtPointer(rawDoc as JsonValue, pointer)
      if (!res.ok) return pageDesignServiceFailure('NOT_FOUND', res.reason, '使用 jsonDoc.read 确认文档结构。')
      return success({ entries: res.entries }, `${docType}${pointer} 列出 ${res.entries.length} 个子节点`)
    }

    if (operation === 'get') {
      const pointer = (args as { pointer: string }).pointer
      const res = resolvePointer(rawDoc as JsonValue, pointer)
      if (!res.ok) return pageDesignServiceFailure('NOT_FOUND', res.reason, '使用 jsonDoc.list 确认路径。')
      return success({ value: res.value }, `${docType}${pointer} 已读取`)
    }

    if (operation === 'query') {
      const queryArgs = args as { expression: string; pointer?: string }
      const pointer = queryArgs.pointer ?? ''
      let target: JsonValue = rawDoc as JsonValue
      if (pointer !== '') {
        const res = resolvePointer(target, pointer)
        if (!res.ok) return pageDesignServiceFailure('NOT_FOUND', res.reason, '使用 jsonDoc.list 确认路径。')
        target = res.value
      }
      try {
        const result = jmespath.search(target, queryArgs.expression) as unknown
        return success({ result }, 'JMESPath 查询完成')
      } catch (e) {
        return pageDesignServiceFailure('INVALID_EXPRESSION', `JMESPath 表达式错误: ${e instanceof Error ? e.message : String(e)}`, '检查 expression 语法，参考 https://jmespath.org。')
      }
    }

    const writeDoc = host?.writeJsonDoc
    if (typeof writeDoc !== 'function') {
      return pageDesignServiceFailure('NO_JSON_DOC_HOST', '宿主未绑定 PageDesignEditHost.writeJsonDoc', '先调用 PageDesignService.bootstrap 并确保宿主提供 writeJsonDoc。')
    }

    if (operation === 'set') {
      const setArgs = args as { pointer: string; value: JsonValue }
      const res = setAtPointer(rawDoc as JsonValue, setArgs.pointer, setArgs.value)
      if (!res.ok) return pageDesignServiceFailure('INVALID_POINTER', res.reason, '检查 pointer 格式。')
      writeDoc(docType, res.doc)
      return success(undefined, `${docType}${setArgs.pointer} 已设置`)
    }

    if (operation === 'delete') {
      const pointer = (args as { pointer: string }).pointer
      const res = deleteAtPointer(rawDoc as JsonValue, pointer)
      if (!res.ok) return pageDesignServiceFailure('NOT_FOUND', res.reason, '使用 jsonDoc.list 确认路径后再删除。')
      writeDoc(docType, res.doc)
      return success(undefined, `${docType}${pointer} 已删除`)
    }

    if (operation === 'append') {
      const appendArgs = args as { arrayPointer: string; element: JsonValue }
      const res = appendAtPointer(rawDoc as JsonValue, appendArgs.arrayPointer, appendArgs.element)
      if (!res.ok) return pageDesignServiceFailure('NOT_ARRAY', res.reason, '使用 jsonDoc.get 确认目标是数组。')
      writeDoc(docType, res.doc)
      return success(undefined, `元素已追加到 ${docType}${appendArgs.arrayPointer}`)
    }

    const patches = (args as { patches: Array<{ pointer: string; value: JsonValue }> }).patches
    let doc = rawDoc as JsonValue
    for (const [i, patch] of patches.entries()) {
      const res = setAtPointer(doc, patch.pointer, patch.value)
      if (!res.ok) return pageDesignServiceFailure('INVALID_POINTER', `patches[${i}] 失败：${res.reason}`, '检查 pointer 格式，本批次全部未提交。')
      doc = res.doc
    }
    writeDoc(docType, doc)
    return success(undefined, `${docType} 批量写入 ${patches.length} 项已完成`)
  }

  releasePage(pageId: string): void {
    this.states.delete(pageId)
  }
}
