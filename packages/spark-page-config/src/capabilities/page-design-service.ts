/**
 * PageDesignService 与服务端注册。
 *
 * 聚合了编辑宿主注册、脚本契约校验、序列化与 Action 执行、
 * 以及 PageDesignService 主体。
 */

import type { DataSetCrudTool } from '@spark-view/spark-data'
import {
  getNextPageDesignFlowStep,
  getPageDesignFlowStep,
  listPageDesignFlowSteps,
  summarizePageDesignFlowPhases,
  type PageDesignFlowPhaseSummary,
  type PageDesignFlowStep,
} from './page-design-artifacts'

import {
  PageDesignEditSession,
  type PageDesignServiceActionBinding,
  type PageDesignServiceContext,
  type PageDesignServiceOptions,
  type PageDesignServiceResult,
  type PageDesignTextFileKey,
  validateScriptServiceContract,
} from './page-edit-session'

// ── SECTION 2: 编辑宿主注册 ──

export type PageDesignEditHostSnapshot = {
  readonly pageId: string
  readonly host: PageDesignEditSession.Host
}

type PageDesignEditHostResolver = () => PageDesignEditHostSnapshot | null

function normalizePageId(pageId: string | null | undefined): string {
  return typeof pageId === 'string' ? pageId.trim() : ''
}

class PageDesignEditHostRegistry {
  private readonly resolvers = new Set<PageDesignEditHostResolver>()

  register(resolver: PageDesignEditHostResolver): () => void {
    this.resolvers.add(resolver)
    return () => {
      this.resolvers.delete(resolver)
    }
  }

  resolveHost(pageId?: string | null): PageDesignEditSession.Host | null {
    const requestedPageId = normalizePageId(pageId)
    const snapshots = this.readSnapshots().reverse()
    if (requestedPageId !== '') {
      const exact = snapshots.find((snapshot) => snapshot.pageId === requestedPageId)
      if (exact !== undefined) return exact.host
    }
    return snapshots[0]?.host ?? null
  }

  resolvePageId(pageId?: string | null): string | null {
    const requestedPageId = normalizePageId(pageId)
    const snapshots = this.readSnapshots().reverse()
    if (requestedPageId !== '') {
      const exact = snapshots.find((snapshot) => snapshot.pageId === requestedPageId)
      if (exact !== undefined) return exact.pageId
    }
    return snapshots[0]?.pageId ?? null
  }

  private readSnapshots(): PageDesignEditHostSnapshot[] {
    const snapshots: PageDesignEditHostSnapshot[] = []
    for (const resolver of this.resolvers) {
      const snapshot = resolver()
      const pageId = normalizePageId(snapshot?.pageId)
      if (snapshot === null || pageId === '') continue
      snapshots.push({ pageId, host: snapshot.host })
    }
    return snapshots
  }
}

const editHostRegistry = new PageDesignEditHostRegistry()

export function registerPageDesignEditHost(resolver: PageDesignEditHostResolver): () => void {
  return editHostRegistry.register(resolver)
}

export function resolvePageDesignEditHost(pageId?: string | null): PageDesignEditSession.Host | null {
  return editHostRegistry.resolveHost(pageId)
}

export function resolvePageDesignEditPageId(pageId?: string | null): string | null {
  return editHostRegistry.resolvePageId(pageId)
}

// ── SECTION 5: 序列化与 Action 执行 ──

function hasToJson(value: object): value is { toJson: () => unknown } {
  return 'toJson' in value && typeof value.toJson === 'function'
}

function readToJson(value: object): (() => unknown) | null {
  if (!hasToJson(value)) return null
  return () => value.toJson()
}

function toSerializableServiceData(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  const toJson = readToJson(value)
  if (toJson !== null) {
    return toSerializableServiceData(toJson())
  }
  if (Array.isArray(value)) return value.map(toSerializableServiceData)
  if (value instanceof Set) return [...value].map(toSerializableServiceData)
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [String(key), toSerializableServiceData(item)]))

  const seen = new WeakSet<object>()
  const serialized = JSON.stringify(value, (_key, nested: unknown) => {
    if (typeof nested === 'bigint') return nested.toString()
    if (nested === null || typeof nested !== 'object') return nested
    const nestedToJson = readToJson(nested)
    if (nestedToJson !== null) {
      return toSerializableServiceData(nestedToJson())
    }
    if (nested instanceof Set) return [...nested].map(toSerializableServiceData)
    if (nested instanceof Map) return Object.fromEntries([...nested].map(([key, item]) => [String(key), toSerializableServiceData(item)]))
    if (seen.has(nested)) return '[Circular]'
    seen.add(nested)
    return nested
  })
  return JSON.parse(serialized)
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function runRegisteredActionTarget<TTarget>(
  options: PageDesignServiceActionBinding<TTarget>,
  target: TTarget,
  args: unknown,
): Promise<PageDesignServiceResult<unknown>> {
  try {
    const data = await options.run(target, args)
    return PageDesignService.success(toSerializableServiceData(data), `${options.serviceLabel} 完成`)
  } catch (error) {
    return PageDesignService.failure(
      'ACTION_ERROR',
      toErrorMessage(error),
      options.fixHint ?? '检查输入参数和业务 action 实现。',
    )
  }
}

// ── SECTION 6: PageDesignService ──

export type PageDesignFlowQuery = {
  phase?: string
  step?: number
  afterStep?: number
}

export type PageDesignFlowDescription = {
  phases: PageDesignFlowPhaseSummary[]
  steps: readonly PageDesignFlowStep[]
  selectedStep: PageDesignFlowStep | null
  nextStep: PageDesignFlowStep | null
}

type PageDesignTextFileBinding = {
  label: string
  readName: 'readScript' | 'readStyle'
  writeName: 'writeScript' | 'writeStyle'
  read: (host: PageDesignEditSession.Host) => (() => string) | undefined
  write: (host: PageDesignEditSession.Host) => ((content: string) => void) | undefined
  validateWrite?: (content: string) => PageDesignServiceResult<undefined> | null
}

const TEXT_FILE_BINDING_BY_KEY: Record<PageDesignTextFileKey, PageDesignTextFileBinding> = {
  script: {
    label: 'script.js',
    readName: 'readScript',
    writeName: 'writeScript',
    read: (host) => host.readScript,
    write: (host) => host.writeScript,
    validateWrite: validateScriptServiceContract,
  },
  style: {
    label: 'style.css',
    readName: 'readStyle',
    writeName: 'writeStyle',
    read: (host) => host.readStyle,
    write: (host) => host.writeStyle,
  },
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
    return PageDesignService.failure('NO_NODE_TREE', 'PageDesignService.bootstrap 失败：缺少 nodeTree 实例（PageDesignEditSession.Host.getNodeTree）', '宿主注入可用的 nodeTree 实例。')
  }

  const dataSetTool = state.getActiveDataSetTool()
  if (dataSetTool === null) {
    return PageDesignService.failure('NO_DATASET_EDIT', 'PageDesignService.bootstrap 失败：缺少 dataset 实例（PageDesignEditSession.Host.getDataSetTool）', '宿主注入可用的 dataset 实例。')
  }

  const missingTextBindings = Object.values(TEXT_FILE_BINDING_BY_KEY).flatMap((binding) => {
    const missing: string[] = []
    if (state.host === null || binding.read(state.host) === undefined) missing.push(binding.readName)
    if (state.host === null || binding.write(state.host) === undefined) missing.push(binding.writeName)
    return missing
  })
  if (missingTextBindings.length > 0) {
    return PageDesignService.failure(
      'NO_TEXT_MODEL',
      `PageDesignService.bootstrap 失败：缺少文本模型绑定 ${missingTextBindings.join(', ')}`,
      '宿主注入 PageDesignEditSession.Host.readScript/writeScript/readStyle/writeStyle。',
    )
  }

  tree.toJSON()
  dataSetTool.toJson()
  readBoundTextModel(state, TEXT_FILE_BINDING_BY_KEY.script)
  readBoundTextModel(state, TEXT_FILE_BINDING_BY_KEY.style)
  state.phase = 'editing'
  return PageDesignService.success({ phase: state.phase }, '编辑会话已完成宿主检查，进入 editing 状态')
}

function ensureTextModelAccess(
  state: PageDesignEditSession,
  fileKey: PageDesignTextFileKey,
  mode: 'read' | 'write',
): string | null {
  const binding = TEXT_FILE_BINDING_BY_KEY[fileKey]
  if (state.host === null) {
    return `缺少 live text model: ${mode === 'read' ? binding.readName : binding.writeName}`
  }
  const action = mode === 'read' ? binding.read(state.host) : binding.write(state.host)
  return action === undefined ? `缺少 live text model: ${mode === 'read' ? binding.readName : binding.writeName}` : null
}

function readBoundTextModel(state: PageDesignEditSession, binding: PageDesignTextFileBinding): string {
  const reader = state.host === null ? undefined : binding.read(state.host)
  if (reader === undefined) {
    throw new Error(`缺少 live text model: ${binding.readName}`)
  }
  return reader()
}

function writeBoundTextModel(state: PageDesignEditSession, binding: PageDesignTextFileBinding, content: string): void {
  const writer = state.host === null ? undefined : binding.write(state.host)
  if (writer === undefined) {
    throw new Error(`缺少 live text model: ${binding.writeName}`)
  }
  writer(content)
}

export class PageDesignService {
  private readonly states = new Map<string, PageDesignEditSession>()

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
    return PageDesignService.success(describeProgress(state), `pageDesign 编辑状态：${state.phase}`)
  }

  describeDesignFlow(
    _context: PageDesignServiceContext,
    query: PageDesignFlowQuery = {},
  ): PageDesignServiceResult<PageDesignFlowDescription> {
    const selectedStep = query.step === undefined ? null : getPageDesignFlowStep(query.step)
    const nextStep = query.afterStep === undefined
      ? (selectedStep === null ? null : getNextPageDesignFlowStep(selectedStep.step))
      : getNextPageDesignFlowStep(query.afterStep)
    const steps = selectedStep === null
      ? listPageDesignFlowSteps(query.phase)
      : [selectedStep]

    return PageDesignService.success(
      {
        phases: summarizePageDesignFlowPhases(),
        steps,
        selectedStep,
        nextStep,
      },
      '页面设计 100 步流程已返回',
    )
  }

  readTextModel(context: PageDesignServiceContext, fileKey: PageDesignTextFileKey): PageDesignServiceResult<{ content: string }> {
    const state = this.getState(context)
    const binding = TEXT_FILE_BINDING_BY_KEY[fileKey]
    const accessError = ensureTextModelAccess(state, fileKey, 'read')
    if (accessError !== null) {
      return PageDesignService.failure('NO_TEXT_MODEL', accessError, '请先调用 PageDesignService.bootstrap 初始化编辑会话，并确保宿主绑定 PageDesignEditSession.Host.read*/write*。')
    }
    return PageDesignService.success({ content: readBoundTextModel(state, binding) }, `${binding.label} 内容已返回`)
  }

  writeTextModel(context: PageDesignServiceContext, fileKey: PageDesignTextFileKey, content: string): PageDesignServiceResult<undefined> {
    const state = this.getState(context)
    const binding = TEXT_FILE_BINDING_BY_KEY[fileKey]
    const accessError = ensureTextModelAccess(state, fileKey, 'write')
    if (accessError !== null) {
      return PageDesignService.failure('NO_TEXT_MODEL', accessError, '请先调用 PageDesignService.bootstrap 初始化编辑会话，并确保宿主绑定 PageDesignEditSession.Host.read*/write*。')
    }
    const scriptContractError = binding.validateWrite?.(content) ?? null
    if (scriptContractError !== null) return scriptContractError
    writeBoundTextModel(state, binding, content)
    return PageDesignService.success(undefined, `${binding.label} 已更新`)
  }

  async runNodeTreeAction(
    context: PageDesignServiceContext,
    args: unknown,
    options: PageDesignServiceActionBinding<PageDesignEditSession.NodeTree>,
  ): Promise<PageDesignServiceResult<unknown>> {
    const state = this.getState(context)
    const tree: PageDesignEditSession.NodeTree | null = state.getActiveNodeTree()
    if (tree === null) {
      return PageDesignService.failure('NO_NODE_TREE', 'nodeTree 未初始化', '请先调用 PageDesignService.bootstrap 初始化编辑会话。')
    }
    const result = await runRegisteredActionTarget(options, tree, args)
    if (result.ok && options.mutates) {
      state.notifyNodeTreeChanged(tree)
    }
    return result
  }

  async runDatasetAction(
    context: PageDesignServiceContext,
    args: unknown,
    options: PageDesignServiceActionBinding<DataSetCrudTool>,
  ): Promise<PageDesignServiceResult<unknown>> {
    const state = this.getState(context)
    const tool: DataSetCrudTool | null = state.getActiveDataSetTool()
    if (tool === null) {
      return PageDesignService.failure('NO_DATASET_EDIT', 'dataset 未初始化', '请先调用 PageDesignService.bootstrap 初始化编辑会话。')
    }
    const result = await runRegisteredActionTarget(options, tool, args)
    if (result.ok && options.mutates) {
      state.notifyDataSetChanged(tool)
    }
    return result
  }

  releasePage(pageId: string): void {
    this.states.delete(pageId)
  }

  static success<TResult>(data: TResult, summary: string): PageDesignServiceResult<TResult> {
    return { ok: true, data, summary }
  }

  static failure(code: string, msg: string, fix: string): PageDesignServiceResult<never> {
    return { ok: false, code, msg, fix }
  }
}

export namespace PageDesignService {
  export type Context = PageDesignServiceContext
  export type Result<T> = PageDesignServiceResult<T>
  export type ActionBinding<TTarget> = PageDesignServiceActionBinding<TTarget>
  export type Options = PageDesignServiceOptions
  export type TextFileKey = PageDesignTextFileKey
}
