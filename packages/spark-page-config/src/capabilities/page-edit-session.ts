/**
 * 页面设计编辑会话核心。
 *
 * 聚合了编辑会话、Service 层、Workspace、Lifecycle 和全局 Host 注册，
 * 提供 4 文件编辑的完整运行时能力。
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

// ── SECTION 1: 编辑会话核心（原 page-design-edit-session.ts + page-design-node-tree.ts）──

import type {
  SparkNodeTree,
  SparkNodeTreeMethodKey,
} from '../page/model/spark-node-tree'

export type { SparkNodeTreeMethodKey } from '../page/model/spark-node-tree'

export type PageDesignEditPhase = 'idle' | 'editing' | 'saved'

export type PageDesignNodeTree = Pick<SparkNodeTree, SparkNodeTreeMethodKey | 'toJSON'>

export type PageDesignEditHost = {
  getNodeTree?: () => PageDesignNodeTree | null
  onNodeTreeChanged?: (nodeTree: PageDesignNodeTree) => void
  getDataSetTool?: () => DataSetCrudTool | null
  onDataSetChanged?: (tool: DataSetCrudTool) => void
  readScript?: () => string
  writeScript?: (content: string) => void
  readStyle?: () => string
  writeStyle?: (content: string) => void
}

export class PageDesignEditSession {
  phase: PageDesignEditPhase = 'idle'

  host: PageDesignEditHost | null = null

  bindHost(host: PageDesignEditHost): void {
    this.host = host
  }

  getActiveNodeTree(): PageDesignNodeTree | null {
    return this.host?.getNodeTree?.() ?? null
  }

  notifyNodeTreeChanged(nodeTree: PageDesignNodeTree): void {
    this.host?.onNodeTreeChanged?.(nodeTree)
  }

  getActiveDataSetTool(): DataSetCrudTool | null {
    return this.host?.getDataSetTool?.() ?? null
  }

  notifyDataSetChanged(tool: DataSetCrudTool): void {
    this.host?.onDataSetChanged?.(tool)
  }
}

// ── SECTION 2: 编辑宿主注册（原 page-design-edit-host-registry.ts）──

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

// ── SECTION 3: 服务契约类型（原 page-design-service-contract.ts）──

export type PageDesignServiceContext = {
  requestId: string
  pageId: string
}

export type PageDesignServiceOptions = {
  getEditHost: (context: PageDesignServiceContext) => PageDesignEditHost
}

export type PageDesignServiceResult<TResult> =
  | { ok: true; data: TResult; summary: string }
  | { ok: false; code: string; msg: string; fix: string }

export type PageDesignTextFileKey = 'script' | 'style'

export type PageDesignServiceActionBinding<TTarget> = {
  serviceLabel: string
  run: (target: TTarget, args: unknown) => unknown
  mutates: boolean
  fixHint?: string
}

export function pageDesignServiceSuccess<TResult>(
  data: TResult,
  summary: string,
): PageDesignServiceResult<TResult> {
  return { ok: true, data, summary }
}

export function pageDesignServiceFailure(
  code: string,
  msg: string,
  fix: string,
): PageDesignServiceResult<never> {
  return { ok: false, code, msg, fix }
}

function getProp(value: object, key: string): unknown {
  const desc = Object.getOwnPropertyDescriptor(value, key)
  return desc?.value
}

export function isPageDesignServiceResult(value: unknown): value is PageDesignServiceResult<unknown> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false
  const okValue = getProp(value, 'ok')
  if (okValue === true) {
    return 'data' in value && typeof getProp(value, 'summary') === 'string'
  }
  if (okValue === false) {
    return typeof getProp(value, 'code') === 'string'
      && typeof getProp(value, 'msg') === 'string'
      && typeof getProp(value, 'fix') === 'string'
  }
  return false
}

// ── SECTION 4: 脚本契约校验（原 page-design-script-contract.ts）──

type ScriptApiViolationRule = {
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

function validateScriptServiceContract(
  content: string,
): PageDesignServiceResult<undefined> | null {
  const violation = FORBIDDEN_SCRIPT_API_RULES.find((rule) => rule.pattern.test(content))
  if (violation === undefined) return null
  return pageDesignServiceFailure(
    'INVALID_SCRIPT_RUNTIME_API',
    `script.js 使用了不可用的运行时 API：${violation.api}`,
    `${violation.fix} $page 仅用于 showMessage/showConfirm/showPrompt/showAlert/showLoading/navigate 等页面服务；数据入口是 $dataSet，组件入口是 $components.getApi。`,
  )
}

// ── SECTION 5: 序列化与 Action 执行（原 page-design-action-target.ts）──

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
    return pageDesignServiceSuccess(toSerializableServiceData(data), `${options.serviceLabel} 完成`)
  } catch (error) {
    return pageDesignServiceFailure(
      'ACTION_ERROR',
      toErrorMessage(error),
      options.fixHint ?? '检查输入参数和业务 action 实现。',
    )
  }
}

// ── SECTION 6: PageDesignService（原 page-design-service.ts 主体）──

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
    return pageDesignServiceFailure('NO_NODE_TREE', 'PageDesignService.bootstrap 失败：缺少 nodeTree 实例（PageDesignEditHost.getNodeTree）', '宿主注入可用的 nodeTree 实例。')
  }

  const dataSetTool = state.getActiveDataSetTool()
  if (dataSetTool === null) {
    return pageDesignServiceFailure('NO_DATASET_EDIT', 'PageDesignService.bootstrap 失败：缺少 dataset 实例（PageDesignEditHost.getDataSetTool）', '宿主注入可用的 dataset 实例。')
  }

  const missingTextBindings = Object.values(TEXT_FILE_BINDING_BY_KEY).flatMap((binding) => {
    const missing: string[] = []
    if (state.host === null || binding.read(state.host) === undefined) missing.push(binding.readName)
    if (state.host === null || binding.write(state.host) === undefined) missing.push(binding.writeName)
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
  return pageDesignServiceSuccess({ phase: state.phase }, '编辑会话已完成宿主检查，进入 editing 状态')
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
    return pageDesignServiceSuccess(describeProgress(state), `pageDesign 编辑状态：${state.phase}`)
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

    return pageDesignServiceSuccess(
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
      return pageDesignServiceFailure('NO_TEXT_MODEL', accessError, '请先调用 PageDesignService.bootstrap 初始化编辑会话，并确保宿主绑定 PageDesignEditHost.read*/write*。')
    }
    return pageDesignServiceSuccess({ content: readBoundTextModel(state, binding) }, `${binding.label} 内容已返回`)
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
    return pageDesignServiceSuccess(undefined, `${binding.label} 已更新`)
  }

  async runNodeTreeAction(
    context: PageDesignServiceContext,
    args: unknown,
    options: PageDesignServiceActionBinding<PageDesignNodeTree>,
  ): Promise<PageDesignServiceResult<unknown>> {
    const state = this.getState(context)
    const tree: PageDesignNodeTree | null = state.getActiveNodeTree()
    if (tree === null) {
      return pageDesignServiceFailure('NO_NODE_TREE', 'nodeTree 未初始化', '请先调用 PageDesignService.bootstrap 初始化编辑会话。')
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
      return pageDesignServiceFailure('NO_DATASET_EDIT', 'dataset 未初始化', '请先调用 PageDesignService.bootstrap 初始化编辑会话。')
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
}

// ── SECTION 7: PageConfigEditWorkspace（原 page-config-edit-workspace.ts）──

import type { BasePageConfigLoader } from '../page/loading/config-types'
import {
  PAGE_FILE_NAMES,
  createPageDocuments,
  forEachDocument,
  isPageFileDocumentDirty,
  type PageDocumentRegistry,
  type PageFileLoadState,
  type PageFileName,
} from './page-file-document'
import type {
  PageConfigCreatePageParams,
  PageConfigFileApi,
  PageConfigFileVersionSummary,
  PageConfigPageSummary,
} from '../page/loading/page-config-file-api'
import {
  PAGE_CONFIG_FILE_NAMES,
  type PageConfigFileName,
} from '../page/loading/config-types'

export type PageConfigEditWorkspaceOptions = {
  fileApi: PageConfigFileApi
  getConfigLoader: () => BasePageConfigLoader
}

export class PageConfigEditWorkspace {
  readonly documents: PageDocumentRegistry = createPageDocuments()

  activePageId = ''

  private readonly fileApi: PageConfigFileApi
  private readonly getConfigLoader: () => BasePageConfigLoader
  private activePageFilesLoadPromise: Promise<void> | null = null
  private activePageFilesLoadPageId = ''
  private activePageFilesLoadEpoch = 0

  constructor(options: PageConfigEditWorkspaceOptions) {
    this.fileApi = options.fileApi
    this.getConfigLoader = options.getConfigLoader
  }

  setActivePage(pageId: string, forceReset = false): boolean {
    const normalizedPageId = pageId.trim()
    if (!normalizedPageId) {
      this.clear()
      return false
    }

    const shouldReset = forceReset || this.activePageId !== normalizedPageId
    if (shouldReset) {
      this.invalidateActivePageFilesLoad()
      this.resetDocuments()
    }
    this.activePageId = normalizedPageId
    return true
  }

  clear(): void {
    this.invalidateActivePageFilesLoad()
    this.activePageId = ''
    this.resetDocuments()
  }

  resetDocuments(): void {
    forEachDocument(this.documents, (_name, doc) => doc.reset())
  }

  isDocumentDirty(name: PageFileName): boolean {
    return isPageFileDocumentDirty(this.documents[name])
  }

  hasAnyFileDirty(): boolean {
    return PAGE_FILE_NAMES.some(name => this.isDocumentDirty(name))
  }

  notifyPageFileChanged(pageId: string, filename: PageFileName | '__created' | '__deleted' | '__bulk'): void {
    if (filename === '__bulk' || filename === '__created' || filename === '__deleted') {
      this.clearPageConfigCache(pageId)
      this.invalidateActivePageFilesLoad()
      return
    }
    this.clearPageConfigCache(pageId, filename)
  }

  clearPageConfigCache(pageId: string, filename?: PageFileName): void {
    const loader = this.getConfigLoader()
    if (filename !== undefined) {
      loader.clearCache(this.toPageConfigLoaderPath(pageId, filename))
      return
    }
    for (const name of PAGE_FILE_NAMES) {
      loader.clearCache(this.toPageConfigLoaderPath(pageId, name))
    }
  }

  async ensureActivePageFilesLoaded(options?: { forceReload?: boolean; allowMissingAsEmpty?: boolean }): Promise<void> {
    const pageId = this.activePageId
    if (!pageId) return
    const forceReload = options?.forceReload === true
    const allowMissingAsEmpty = options?.allowMissingAsEmpty === true

    if (this.activePageFilesLoadPromise && this.activePageFilesLoadPageId === pageId) {
      return this.activePageFilesLoadPromise
    }

    if (!forceReload && this.areAllActivePageFilesLoaded()) return

    if (!forceReload && PAGE_FILE_NAMES.some(entry => this.isDocumentDirty(entry))) {
      this.promoteNonDirtyLoadedDocuments()
      return
    }

    const loadEpoch = this.activePageFilesLoadEpoch
    this.activePageFilesLoadPageId = pageId
    const previousLoadStates = new Map<PageFileName, PageFileLoadState>()
    for (const entry of PAGE_FILE_NAMES) {
      previousLoadStates.set(entry, this.documents[entry].loadState.value)
    }

    for (const entry of PAGE_FILE_NAMES) {
      const doc = this.documents[entry]
      if (!forceReload && this.isDocumentDirty(entry)) {
        doc.loadState.value = 'loaded'
        continue
      }
      doc.loadState.value = 'loading'
    }

    const loadPromise = (async () => {
      let loadedSnapshots: Array<{ name: PageFileName; text: string }>
      try {
        loadedSnapshots = await Promise.all(
          PAGE_FILE_NAMES.map(async (entry) => ({
            name: entry,
            text: await this.fetchRemotePageFileContent(pageId, entry, { forceReload, allowMissingAsEmpty }),
          })),
        )
      } catch (error) {
        if (this.activePageFilesLoadEpoch === loadEpoch && this.activePageId === pageId) {
          for (const entry of PAGE_FILE_NAMES) {
            this.documents[entry].loadState.value = previousLoadStates.get(entry) ?? 'idle'
          }
        }
        throw error
      }

      if (this.activePageFilesLoadEpoch !== loadEpoch || this.activePageId !== pageId) return

      for (const snapshot of loadedSnapshots) {
        const doc = this.documents[snapshot.name]
        if (!forceReload && this.isDocumentDirty(snapshot.name)) {
          doc.loadState.value = 'loaded'
          continue
        }
        doc.loadFromText(snapshot.text, { markSaved: true })
      }
    })().finally(() => {
      if (this.activePageFilesLoadEpoch === loadEpoch && this.activePageFilesLoadPageId === pageId) {
        this.activePageFilesLoadPromise = null
        this.activePageFilesLoadPageId = ''
      }
    })

    this.activePageFilesLoadPromise = loadPromise
    return loadPromise
  }

  async loadPageFile(_name: PageFileName, options?: { forceReload?: boolean; allowMissingAsEmpty?: boolean }): Promise<void> {
    await this.ensureActivePageFilesLoaded(options)
  }

  async savePageFile(name: PageFileName): Promise<void> {
    if (!this.activePageId) return
    const doc = this.documents[name]
    await this.fileApi.saveFileContent(this.activePageId, name, doc.text.value)
    doc.markSaved()
    this.notifyPageFileChanged(this.activePageId, name)
  }

  async listPages(): Promise<PageConfigPageSummary[]> {
    return this.fileApi.listPages()
  }

  async createPage(params: PageConfigCreatePageParams): Promise<Record<string, unknown>> {
    const result = await this.fileApi.createPage(params)
    this.notifyPageFileChanged(params.pageId, '__created')
    return result
  }

  async deletePage(pageId: string): Promise<void> {
    await this.fileApi.deletePage(pageId)
    this.notifyPageFileChanged(pageId, '__deleted')
  }

  async listRemotePageVersions(filename: PageFileName): Promise<PageConfigFileVersionSummary[]> {
    if (!this.activePageId) return []
    return this.fileApi.listVersions(this.activePageId, filename)
  }

  async restoreRemotePageVersion(version: number, filename: PageFileName): Promise<void> {
    if (!this.activePageId) return
    const pageId = this.activePageId
    await this.fileApi.restoreVersion(pageId, filename, version)
    this.clearPageConfigCache(pageId, filename)
    this.invalidateActivePageFilesLoad()
    const restoredText = await this.fetchRemotePageFileContent(pageId, filename, { forceReload: true })
    this.documents[filename].loadFromText(restoredText, { markSaved: true })
    this.notifyPageFileChanged(pageId, filename)
  }

  async createRemotePageVersion(filename: PageFileName): Promise<void> {
    if (!this.activePageId) return
    await this.fileApi.createVersion(this.activePageId, filename)
  }

  async deleteRemotePageVersion(version: number, filename: PageFileName): Promise<void> {
    if (!this.activePageId) return
    await this.fileApi.deleteVersion(this.activePageId, filename, version)
  }

  private async fetchRemotePageFileContent(
    pageId: string,
    name: PageFileName,
    options?: { forceReload?: boolean; allowMissingAsEmpty?: boolean },
  ): Promise<string> {
    const result = await this.getConfigLoader().loadPageFileContent(pageId, name, {
      forceReload: options?.forceReload === true,
    })
    if (result.success) return result.data ?? ''
    if (result.reason === 'not-found' && options?.allowMissingAsEmpty === true) return ''
    const detail = result.error ?? result.reason ?? 'unknown'
    throw new Error(`读取页面文件失败: ${pageId}/${name} (${detail})`)
  }

  private areAllActivePageFilesLoaded(): boolean {
    return PAGE_FILE_NAMES.every(entry => this.documents[entry].loadState.value === 'loaded')
  }

  private promoteNonDirtyLoadedDocuments(): void {
    for (const entry of PAGE_FILE_NAMES) {
      const doc = this.documents[entry]
      if (doc.loadState.value !== 'loading' && !this.isDocumentDirty(entry) && doc.loadState.value === 'idle') {
        if (doc.text.value || doc.savedText.value) doc.loadState.value = 'loaded'
      }
    }
  }

  private invalidateActivePageFilesLoad(): void {
    this.activePageFilesLoadPromise = null
    this.activePageFilesLoadPageId = ''
    this.activePageFilesLoadEpoch += 1
  }

  private toPageConfigLoaderPath(pageId: string, name: PageFileName): string {
    return `/${encodeURIComponent(pageId)}/${encodeURIComponent(name)}`
  }
}

// ── SECTION 8: PageConfigFileLifecycle（原 page-config-file-lifecycle.ts）──

import type { NavNode } from '../page/navigation/nav-model'
import {
  defaultNavIconByKind,
  findConfigNodeByPageId,
  normalizeNavNode,
} from '../page/navigation/nav-editing'
import type { NavigationConfigClient } from '../page/navigation/client'

export type PageConfigFileLifecycleOptions = {
  fileApi: PageConfigFileApi
  navigationClient: NavigationConfigClient
  getConfigLoader?: () => Pick<BasePageConfigLoader, 'clearCache'>
}

export type PageNavigationMountParams = PageConfigCreatePageParams & {
  node?: NavNode
  parentId?: string | null
  index?: number
}

export type CreateMountedPageParams = PageNavigationMountParams & {
  rollbackPageOnNavigationFailure?: boolean
}

export type CreateMountedPageResult = {
  page: Record<string, unknown>
  node: NavNode
}

export type RemoveMountedPageParams = {
  pageId: string
  nodeId?: string
  deleteFiles?: boolean
}

export type RemoveMountedPageResult = {
  deletedNode: NavNode | null
  deletedFiles: boolean
}

function assertNonEmptyPageId(pageId: string): string {
  const normalized = pageId.trim()
  if (normalized.length === 0) {
    throw new Error('pageId must be a non-empty string')
  }
  return normalized
}

function defaultPageNavigationNode(params: PageNavigationMountParams): NavNode {
  const pageId = assertNonEmptyPageId(params.pageId)
  const title = params.title?.trim()
  const icon = params.icon?.trim()
  const node = params.node ?? {
    id: pageId,
    title: title !== undefined && title.length > 0 ? title : pageId,
    icon: icon !== undefined && icon.length > 0 ? icon : defaultNavIconByKind('page'),
    nodeKind: 'page',
    path: `/${pageId}`,
  }
  return normalizeNavNode(node)
}

export class PageConfigFileLifecycle {
  private readonly fileApi: PageConfigFileApi
  private readonly navigationClient: NavigationConfigClient
  private readonly getConfigLoader: (() => Pick<BasePageConfigLoader, 'clearCache'>) | undefined

  constructor(options: PageConfigFileLifecycleOptions) {
    this.fileApi = options.fileApi
    this.navigationClient = options.navigationClient
    this.getConfigLoader = options.getConfigLoader
  }

  async createPage(params: PageConfigCreatePageParams): Promise<Record<string, unknown>> {
    const pageId = assertNonEmptyPageId(params.pageId)
    const result = await this.fileApi.createPage({
      pageId,
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.icon === undefined ? {} : { icon: params.icon }),
    })
    this.clearPageCache(pageId)
    return result
  }

  async deletePage(pageId: string): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    await this.fileApi.deletePage(normalizedPageId)
    this.clearPageCache(normalizedPageId)
  }

  async mountPage(params: PageNavigationMountParams): Promise<NavNode> {
    assertNonEmptyPageId(params.pageId)
    return this.navigationClient.addNode({
      ...(params.parentId === undefined ? {} : { parentId: params.parentId }),
      node: defaultPageNavigationNode(params),
      ...(params.index === undefined ? {} : { index: params.index }),
    })
  }

  async createMountedPage(params: CreateMountedPageParams): Promise<CreateMountedPageResult> {
    const pageId = assertNonEmptyPageId(params.pageId)
    const page = await this.createPage(params)
    try {
      const node = await this.mountPage(params)
      return { page, node }
    } catch (error) {
      if (params.rollbackPageOnNavigationFailure === true) {
        await this.fileApi.deletePage(pageId)
        this.clearPageCache(pageId)
      }
      throw error
    }
  }

  async moveMountedPage(nodeId: string, newParentId: string | null, index: number): Promise<NavNode> {
    if (nodeId.trim().length === 0) {
      throw new Error('nodeId must be a non-empty string')
    }
    return this.navigationClient.moveNode(nodeId, newParentId, index)
  }

  async unmountPage(pageId: string, nodeId?: string): Promise<NavNode | null> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    const resolvedNodeId = await this.resolveNavigationNodeId(normalizedPageId, nodeId)
    return this.navigationClient.deleteNode(resolvedNodeId)
  }

  async removeMountedPage(params: RemoveMountedPageParams): Promise<RemoveMountedPageResult> {
    const pageId = assertNonEmptyPageId(params.pageId)
    const deletedNode = await this.unmountPage(pageId, params.nodeId)
    const shouldDeleteFiles = params.deleteFiles !== false
    if (shouldDeleteFiles) {
      await this.deletePage(pageId)
    }
    return { deletedNode, deletedFiles: shouldDeleteFiles }
  }

  clearPageCache(pageId: string, filename?: PageConfigFileName): void {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    const loader = this.getConfigLoader?.()
    if (loader === undefined) return
    if (filename !== undefined) {
      loader.clearCache(this.toPageConfigLoaderPath(normalizedPageId, filename))
      return
    }
    for (const name of PAGE_CONFIG_FILE_NAMES) {
      loader.clearCache(this.toPageConfigLoaderPath(normalizedPageId, name))
    }
  }

  private async resolveNavigationNodeId(pageId: string, nodeId?: string): Promise<string> {
    const explicitNodeId = nodeId?.trim()
    if (explicitNodeId) return explicitNodeId

    const root = await this.navigationClient.loadRoot()
    const found = findConfigNodeByPageId(root.children, assertNonEmptyPageId(pageId))
    if (found === null) {
      throw new Error(`navigation node not found for pageId: ${pageId}`)
    }
    return found.id
  }

  private toPageConfigLoaderPath(pageId: string, name: PageConfigFileName): string {
    return `/${encodeURIComponent(pageId)}/${encodeURIComponent(name)}`
  }
}
