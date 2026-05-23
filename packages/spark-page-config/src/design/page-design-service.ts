/**
 * PageDesignService 与服务端注册。
 *
 * 聚合了编辑宿主注册、脚本契约校验、序列化与 Action 执行、
 * 以及 PageDesignService 主体。
 */

import type { DataSetCrudTool } from '@spark-view/spark-data'
import { LlmSchemaValidator } from '@spark-view/spark-ai/schema'
import type { ModuleParameterPayloadGuide } from '@spark-view/spark-ai/module-semantic'
import {
  getNextPageDesignFlowStep,
  getPageDesignFlowStep,
  listPageDesignFlowSteps,
  summarizePageDesignFlowPhases,
  type PageDesignFlowPhaseSummary,
  type PageDesignFlowStep,
} from './artifacts'

import {
  PageDesignEditSession,
  type PageDesignEditHost,
  type PageDesignNodeTree,
  type PageDesignServiceActionBinding,
  type PageDesignServiceContext,
  type PageDesignServiceOptions,
  type PageDesignServiceResult,
  type PageDesignTextFileKey,
} from './page-edit-session'
import { validateScriptServiceContract } from '../ai/text-model-tool-catalog'

// ── SECTION 2: 编辑宿主注册 ──

export type PageDesignEditHostSnapshot = {
  readonly pageId: string
  readonly host: PageDesignEditHost
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

  resolveHost(pageId?: string | null): PageDesignEditHost | null {
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

export function resolvePageDesignEditHost(pageId?: string | null): PageDesignEditHost | null {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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

export type PageDesignNodePayloadValidationTarget = {
  readonly type: string
  readonly id: string
  readonly path: string
  readonly props: Readonly<Record<string, unknown>>
}

type PageDesignTextFileBinding = {
  label: string
  readName: 'readScript' | 'readStyle'
  writeName: 'writeScript' | 'writeStyle'
  read: (host: PageDesignEditHost) => (() => string) | undefined
  write: (host: PageDesignEditHost) => ((content: string) => void) | undefined
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

// PAGE_DESIGN_AI_TRACE[page-design-live-service]: pageDesign AI 工具共享的 live edit bridge；负责把 ModuleKind action 落到 PageDesignEditHost，而不是 Java 后端直接写页面文件。
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

  // PAGE_DESIGN_AI_TRACE[page-design-payload-guide-state]: 当前 pageDesign 会话已获取的组件 payload guide 记录在这里；用于区分“知识已喂给模型”和“props 实际校验”。
  recordNodePayloadGuide(context: PageDesignServiceContext, key: string, guide: ModuleParameterPayloadGuide): PageDesignServiceResult<{ key: string; guidedKeys: readonly string[] }> {
    const normalized = key.trim()
    if (normalized.length === 0) {
      return PageDesignService.failure('INVALID_PAYLOAD_KEY', '组件参数荷载 key 不能为空', '调用 guidePayload 时传入非空组件 type/key。')
    }
    const state = this.getState(context)
    state.markNodePayloadGuided(normalized, guide)
    return PageDesignService.success({
      key: normalized,
      guidedKeys: state.listGuidedNodePayloads(),
    }, `${normalized} 参数荷载指南已记录到当前 pageDesign 会话`)
  }

  validateNodePayloadGuides(
    context: PageDesignServiceContext,
    componentTypes: readonly string[],
    actionName: string,
  ): PageDesignServiceResult<undefined> | null {
    const state = this.getState(context)
    const missing = [...new Set(componentTypes.map((item) => item.trim()).filter((item) => item.length > 0))]
      .filter((type) => !state.hasGuidedNodePayload(type))
      .sort()
    if (missing.length === 0) return null
    return PageDesignService.failure(
      'PAYLOAD_GUIDE_REQUIRED',
      `node-tree.${actionName} 缺少组件参数荷载指南: ${missing.join(', ')}`,
      `写入这些 SparkNode 前，必须先逐个调用 payload-catalog.guidePayload，例如 ${missing.map((type) => `{ key: "${type}" }`).join(', ')}。`,
    )
  }

  // PAGE_DESIGN_AI_TRACE[page-design-payload-props-validator]: node-tree 写入前的 props 参数校验真源；参数错就返回 code/msg/fix 给 LLM 修正重试。
  validateNodePayloadProps(
    context: PageDesignServiceContext,
    targets: readonly PageDesignNodePayloadValidationTarget[],
    actionName: string,
  ): PageDesignServiceResult<undefined> | null {
    const state = this.getState(context)
    const issues: string[] = []
    for (const target of targets) {
      const guide = state.getGuidedNodePayload(target.type)
      if (guide === null) continue
      const validation = LlmSchemaValidator.validateLlmDeserializedParams(target.props, guide.paramsSchema)
      if (validation.ok) continue
      const formatted = LlmSchemaValidator.formatLlmParamValidationIssues(validation.issues)
      issues.push(`${target.path}<${target.type}${target.id.length > 0 ? `#${target.id}` : ''}> props ${formatted}`)
    }
    if (issues.length === 0) return null
    return PageDesignService.failure(
      'NODE_PAYLOAD_SCHEMA_INVALID',
      `node-tree.${actionName} 组件 props 不符合参数荷载指南: ${issues.join('；')}`,
      '根据对应 type 的 payload-catalog.guidePayload 返回的 paramsSchema 修正 node.props；字段类型、枚举值和必填字段必须与指南一致。',
    )
  }

  hasDataTables(context: PageDesignServiceContext): boolean {
    const tool = this.getState(context).getActiveDataSetTool()
    if (tool === null) return false
    const data = tool.toJson()
    if (!isRecord(data)) return false
    const tables = data['tables']
    return isRecord(tables) && Object.keys(tables).length > 0
  }

  readTextModel(context: PageDesignServiceContext, fileKey: PageDesignTextFileKey): PageDesignServiceResult<{ content: string }> {
    const state = this.getState(context)
    const binding = TEXT_FILE_BINDING_BY_KEY[fileKey]
    const accessError = ensureTextModelAccess(state, fileKey, 'read')
    if (accessError !== null) {
      return PageDesignService.failure('NO_TEXT_MODEL', accessError, '检查 Host 启动和宿主绑定；pageDesign 会话启动时应已自动 bootstrap，并提供 PageDesignEditSession.Host.read*/write*。')
    }
    return PageDesignService.success({ content: readBoundTextModel(state, binding) }, `${binding.label} 内容已返回`)
  }

  writeTextModel(context: PageDesignServiceContext, fileKey: PageDesignTextFileKey, content: string): PageDesignServiceResult<undefined> {
    const state = this.getState(context)
    const binding = TEXT_FILE_BINDING_BY_KEY[fileKey]
    const accessError = ensureTextModelAccess(state, fileKey, 'write')
    if (accessError !== null) {
      return PageDesignService.failure('NO_TEXT_MODEL', accessError, '检查 Host 启动和宿主绑定；pageDesign 会话启动时应已自动 bootstrap，并提供 PageDesignEditSession.Host.read*/write*。')
    }
    const scriptContractError = binding.validateWrite?.(content) ?? null
    if (scriptContractError !== null) return scriptContractError
    writeBoundTextModel(state, binding, content)
    return PageDesignService.success(undefined, `${binding.label} 已更新`)
  }

  async runNodeTreeAction(
    context: PageDesignServiceContext,
    args: unknown,
    options: PageDesignServiceActionBinding<PageDesignNodeTree>,
  ): Promise<PageDesignServiceResult<unknown>> {
    const state = this.getState(context)
    const tree: PageDesignNodeTree | null = state.getActiveNodeTree()
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
