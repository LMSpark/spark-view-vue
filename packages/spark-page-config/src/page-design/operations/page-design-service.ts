import type { DataSetCrudTool } from '@spark-view/spark-data'
import {
  PageDesignEditSession,
  type PageDesignEditHost,
} from '../editing/edit-session'
import type { PageDesignNodeTree } from '../editing/node-tree-types'

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

type PageDesignTextReadMethod = 'readScript' | 'readStyle'
type PageDesignTextWriteMethod = 'writeScript' | 'writeStyle'

interface PageDesignTextFileBinding {
  label: string
  readMethod: PageDesignTextReadMethod
  writeMethod: PageDesignTextWriteMethod
  validateWrite?: (content: string) => PageDesignServiceResult<undefined> | null
}

const TEXT_FILE_BINDING_BY_KEY: Record<'script' | 'style', PageDesignTextFileBinding> = {
  script: {
    label: 'script.js',
    readMethod: 'readScript',
    writeMethod: 'writeScript',
    validateWrite: validateScriptServiceContract,
  },
  style: {
    label: 'style.css',
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

  const missingTextBindings = Object.values(TEXT_FILE_BINDING_BY_KEY).flatMap((binding) => {
    const missing: string[] = []
    if (typeof state.host?.[binding.readMethod] !== 'function') missing.push(String(binding.readMethod))
    if (typeof state.host?.[binding.writeMethod] !== 'function') missing.push(String(binding.writeMethod))
    return missing
  })
  if (missingTextBindings.length > 0) {
    return pageDesignServiceFailure(
      'NO_TEXT_MODEL',
      `PageDesignService.bootstrap 失败：缺少文本模型绑定 ${missingTextBindings.join(', ')}`,
      '宿主注入 PageDesignEditHost.readScript/writeScript/readStyle/writeStyle。',
    )
  }

  tree.toJSON()
  dataSetTool.toJson()
  readBoundTextModel(state, TEXT_FILE_BINDING_BY_KEY.script)
  readBoundTextModel(state, TEXT_FILE_BINDING_BY_KEY.style)
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

function readBoundTextModel(state: PageDesignEditSession, binding: PageDesignTextFileBinding): string {
  const reader = state.host?.[binding.readMethod]
  if (typeof reader !== 'function') {
    throw new Error(`缺少 live text model: ${String(binding.readMethod)}`)
  }
  return reader()
}

function writeBoundTextModel(state: PageDesignEditSession, binding: PageDesignTextFileBinding, content: string): void {
  const writer = state.host?.[binding.writeMethod]
  if (typeof writer !== 'function') {
    throw new Error(`缺少 live text model: ${String(binding.writeMethod)}`)
  }
  writer(content)
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

function serializableSnapshotsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(toSerializableServiceData(left)) === JSON.stringify(toSerializableServiceData(right))
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
    return success({ content: readBoundTextModel(state, binding) }, `${binding.label} 内容已返回`)
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
    writeBoundTextModel(state, binding, content)
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
    const beforeSnapshot = options.mutates ? tree.toJSON() : null
    const result = useMethodBackedTarget(options, tree, args)
    if (result.ok && options.mutates && !serializableSnapshotsEqual(beforeSnapshot, tree.toJSON())) {
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
    const beforeSnapshot = options.mutates ? tool.toJson() : null
    const result = useMethodBackedTarget(options, tool, args)
    if (result.ok && options.mutates && !serializableSnapshotsEqual(beforeSnapshot, tool.toJson())) {
      state.notifyDataSetChanged(tool)
    }
    return result
  }

  releasePage(pageId: string): void {
    this.states.delete(pageId)
  }
}
