/**
 * PageDesignService 与服务端注册。
 *
 * 聚合了编辑宿主注册、脚本契约校验、序列化与 Action 执行、
 * 以及 PageDesignService 主体。
 */

import { isRecord } from '@spark-view/spark-utils'
import {
  DataMember,
  isSparkNode,
  type DataColumn,
  type DataRow,
  type DataSetCrudTool,
  type SparkNode,
} from '@spark-view/spark-data'
import { AiJsonSchemaValidator } from '@spark-view/spark-ai/json'
import type { AiModulePayloadGuide } from '@spark-view/spark-ai/modules'
import {
  getNextPageDesignFlowStep,
  getPageDesignFlowStep,
  listPageDesignFlowSteps,
  matchPageDesignTaskGuides,
  summarizePageDesignFlowPhases,
  type PageDesignFlowPhaseSummary,
  type PageDesignFlowStep,
  type PageDesignTaskGuide,
} from './artifacts/design-flow'
import { detectPageDesignStages } from './artifacts/page-design-stage-detection'

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
import { validateScriptServiceContract } from './script-contract'

// ── Action 结果序列化与错误映射 ───────────────────────────

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

// ── PageDesignService 公共契约 ────────────────────────────

/**
 * lifecycle.describeDesignFlow 的查询参数。
 *
 * `intent` 用于匹配任务型知识；`phase/step/afterStep` 用于精确读取 100 步流程，
 * 二者都只影响返回给 LLM 的知识范围，不会修改 workspace。
 */
type PageDesignFlowQuery = {
  phase?: string
  step?: number
  afterStep?: number
  intent?: string
}

/**
 * 页面设计流程查询结果。
 *
 * `taskGuides` 是 intent 命中的任务知识，`steps` 是当前查询范围内的流程步骤；
 * 调用方应先看 describeProgress 的 PageNode 阶段检测，再把二者作为下一轮函数调用依据，
 * 而不是把整份 100 步流程常驻 prompt。
 */
type PageDesignFlowDescription = {
  phases: PageDesignFlowPhaseSummary[]
  steps: readonly PageDesignFlowStep[]
  selectedStep: PageDesignFlowStep | null
  nextStep: PageDesignFlowStep | null
  taskGuides: readonly PageDesignTaskGuide[]
}

export type PageDesignNodePayloadValidationTarget = {
  readonly type: string
  readonly id: string
  readonly path: string
  readonly props: Readonly<Record<string, unknown>>
}

export type PageDesignManagementWorkbenchField = {
  readonly name: string
  readonly label: string
  readonly type?: string
  readonly role?: string
  readonly required?: boolean
  readonly options?: readonly string[]
}

export type PageDesignManagementWorkbenchRequest = {
  readonly title: string
  readonly entityName: string
  readonly tableName?: string
  readonly fields: readonly PageDesignManagementWorkbenchField[]
  readonly rows?: readonly DataRow[]
  readonly filters?: readonly string[]
  readonly metrics?: readonly string[]
  readonly primaryAction?: string
}

type PageDesignTextFileBinding = {
  label: string
  readName: 'readScript' | 'readStyle'
  writeName: 'writeScript' | 'writeStyle'
  read: (host: PageDesignEditHost) => (() => string) | undefined
  write: (host: PageDesignEditHost) => ((content: string) => void) | undefined
  validateWrite?: (content: string) => PageDesignServiceResult<undefined> | null
}

// ── 文本模型绑定与 bootstrap 校验 ────────────────────────

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
  const navDraft = state.host?.getNavDraft?.() ?? null
  const navContext = state.host?.getNavContext?.() ?? null
  const stageDetection = detectPageDesignStages({ phase: state.phase, host: state.host })
  return {
    phase: state.phase,
    bindings: {
      navigation: navDraft !== null,
      navigationContext: navContext !== null,
      nodeTree: state.getActiveNodeTree() !== null,
      dataSet: state.getActiveDataSetTool() !== null,
      readScript: typeof state.host?.readScript === 'function',
      writeScript: typeof state.host?.writeScript === 'function',
      readStyle: typeof state.host?.readStyle === 'function',
      writeStyle: typeof state.host?.writeStyle === 'function',
    },
    pageNodeParts: ['navigation', 'rule', 'dataSet', 'script', 'style'],
    sourceOfTruth: 'PageNode',
    decisionOrder: ['PageNode', '100-step-flow', 'four-file-edit'],
    stageDetection,
    nextStep: state.phase === 'editing'
      ? stageDetection.nextActions[0] ?? '已进入编辑态；按 PageNode 目标子模型调用对应标准件或编辑函数。'
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

// ── PageDesignService 主体 ────────────────────────────────

// PAGE_DESIGN_AI_TRACE[page-design-live-service]: pageDesign AI 工具共享的 live edit bridge；负责把 AiModule action 落到 PageDesignEditHost，而不是 Java 后端直接写页面文件。
/**
 * pageDesign AI 工具的 live edit 服务门面。
 *
 * 服务按 pageId 缓存 `PageDesignEditSession`，负责 bootstrap、文本模型读写、
 * DataSet/node-tree action 落地、payload guide 状态记录和 props 校验。它不保存
 * AI Host 会话历史，也不直接订阅 APP 公共 SSE；订阅适配留在 AI Host/APP 边界。
 */
export class PageDesignService {
  private readonly states = new Map<string, PageDesignEditSession>()

  private readonly getEditHost: PageDesignServiceOptions['getEditHost']

  constructor(options: PageDesignServiceOptions) {
    this.getEditHost = options.getEditHost
  }

  getState(context: PageDesignServiceContext): PageDesignEditSession {
    const existing = this.states.get(context.pageId)
    if (existing !== undefined) {
      existing.bindHost(this.getEditHost(context))
      return existing
    }
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

  // PAGE_DESIGN_REFACTOR_SOURCE[knowledge-query-gate]: lifecycle.describeDesignFlow 的服务端语义；默认不倾倒 100 步正文，按 intent/phase/step 返回可执行知识。
  describeDesignFlow(
    _context: PageDesignServiceContext,
    query: PageDesignFlowQuery = {},
  ): PageDesignServiceResult<PageDesignFlowDescription> {
    const selectedStep = query.step === undefined ? null : getPageDesignFlowStep(query.step)
    const nextStep = query.afterStep === undefined
      ? (selectedStep === null ? null : getNextPageDesignFlowStep(selectedStep.step))
      : getNextPageDesignFlowStep(query.afterStep)
    const taskGuides = matchPageDesignTaskGuides(query.intent)
    const steps = selectedStep === null
      ? listPageDesignFlowStepsForQuery(query.phase, taskGuides)
      : [selectedStep]

    return PageDesignService.success(
      {
        phases: summarizePageDesignFlowPhases(),
        steps,
        selectedStep,
        nextStep,
        taskGuides,
      },
      '页面设计 100 步流程已返回',
    )
  }

  // PAGE_DESIGN_AI_TRACE[page-design-payload-guide-state]: 当前 pageDesign 会话已获取的组件 payload guide 记录在这里；用于区分“知识已喂给模型”和“props 实际校验”。
  recordNodePayloadGuide(context: PageDesignServiceContext, key: string, guide: AiModulePayloadGuide): PageDesignServiceResult<{ key: string; guidedKeys: readonly string[] }> {
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
      const validation = AiJsonSchemaValidator.validateDeserializedParams(target.props, guide.paramsSchema)
      if (validation.ok) continue
      const formatted = AiJsonSchemaValidator.formatAiJsonValidationIssues(validation.issues)
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

  buildManagementWorkbench(
    context: PageDesignServiceContext,
    request: PageDesignManagementWorkbenchRequest,
  ): PageDesignServiceResult<Record<string, unknown>> {
    const state = this.getState(context)
    const dataSetTool = state.getActiveDataSetTool()
    const nodeTree = state.getActiveNodeTree()
    if (dataSetTool === null) {
      return PageDesignService.failure('NO_DATASET_EDIT', 'standard-page.buildManagementWorkbench 缺少 dataset 实例', '请先通过宿主绑定 PageDesignEditHost.getDataSetTool。')
    }
    if (nodeTree === null) {
      return PageDesignService.failure('NO_NODE_TREE', 'standard-page.buildManagementWorkbench 缺少 nodeTree 实例', '请先通过宿主绑定 PageDesignEditHost.getNodeTree。')
    }

    const normalized = normalizeWorkbenchRequest(request)
    if (!normalized.ok) return normalized

    const tableName = normalized.data.tableName
    const dataViewKey = `${tableName}@default`
    const columns = normalized.data.fields.map(toWorkbenchColumn)
    const rows = normalized.data.rows.length > 0
      ? normalized.data.rows
      : createWorkbenchSeedRows(normalized.data.fields)

    dataSetTool.replaceFromJson({
      schemaVersion: 2,
      dataSetName: 'PageDataSet',
      tables: {
        [tableName]: {
          tableName,
          columns,
          resourceType: 'static-data',
          businessCategory: 'master',
          views: {
            default: {
              tableName,
              viewId: 'default',
              page: 1,
              pageSize: 20,
              rows,
              autoCurrentFirst: true,
              autoSelectFirst: true,
              autoLoad: true,
            },
          },
        },
      },
    })
    state.notifyDataSetChanged(dataSetTool)

    replaceRootChildren(nodeTree, createManagementWorkbenchNodes({
      title: normalized.data.title,
      entityName: normalized.data.entityName,
      tableName,
      dataViewKey,
      fields: normalized.data.fields,
      filters: normalized.data.filters,
      metrics: normalized.data.metrics,
      primaryAction: normalized.data.primaryAction,
    }))
    state.notifyNodeTreeChanged(nodeTree)
    updateWorkbenchNavigation(state, normalized.data)

    const scriptResult = this.writeTextModel(context, 'script', createManagementWorkbenchScript(normalized.data))
    if (!scriptResult.ok) return scriptResult
    const styleResult = this.writeTextModel(context, 'style', createManagementWorkbenchStyle(normalized.data))
    if (!styleResult.ok) return styleResult

    return PageDesignService.success({
      tableName,
      dataViewKey,
      fieldCount: normalized.data.fields.length,
      rowCount: rows.length,
      standardPart: 'management-workbench',
      pageNodeParts: ['navigation', 'rule', 'dataSet', 'script', 'style'],
    }, '管理工作台标准件已确定性装配 PageNode 子模型')
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

type NormalizedWorkbenchRequest = {
  readonly title: string
  readonly entityName: string
  readonly tableName: string
  readonly fields: readonly RequiredWorkbenchField[]
  readonly rows: readonly DataRow[]
  readonly filters: readonly string[]
  readonly metrics: readonly string[]
  readonly primaryAction: string
}

type RequiredWorkbenchField = {
  readonly name: string
  readonly label: string
  readonly type: string
  readonly role: string
  readonly required: boolean
  readonly options: readonly string[]
}

function normalizeWorkbenchRequest(
  request: PageDesignManagementWorkbenchRequest,
): PageDesignServiceResult<NormalizedWorkbenchRequest> {
  const title = normalizeText(request.title)
  const entityName = normalizeText(request.entityName)
  const rawFields = Array.isArray(request.fields) ? request.fields : []
  const fields = normalizeWorkbenchFields(rawFields)
  if (title.length === 0) {
    return PageDesignService.failure('INVALID_STANDARD_PART_ARGS', '管理工作台标准件缺少 title', '传入用户可见页面标题，例如“学生成绩管理”。')
  }
  if (entityName.length === 0) {
    return PageDesignService.failure('INVALID_STANDARD_PART_ARGS', '管理工作台标准件缺少 entityName', '传入主业务实体名称，例如 StudentGrade 或 Employee。')
  }
  if (fields.length === 0) {
    return PageDesignService.failure('INVALID_STANDARD_PART_ARGS', '管理工作台标准件至少需要一个业务字段', '根据用户需求抽取主表字段，传入 fields。')
  }
  return PageDesignService.success({
    title,
    entityName,
    tableName: normalizeIdentifier(request.tableName, normalizeIdentifier(entityName, 'BusinessEntity')),
    fields: ensureIdField(fields),
    rows: Array.isArray(request.rows) ? request.rows : [],
    filters: normalizeStringList(request.filters),
    metrics: normalizeStringList(request.metrics),
    primaryAction: normalizeText(request.primaryAction) || '保存',
  }, '管理工作台标准件参数已归一化')
}

function normalizeWorkbenchFields(
  fields: readonly PageDesignManagementWorkbenchField[],
): readonly RequiredWorkbenchField[] {
  return fields
    .map((field) => ({
      name: normalizeIdentifier(field.name, ''),
      label: normalizeText(field.label) || normalizeText(field.name),
      type: normalizeFieldType(field.type),
      role: normalizeText(field.role) || 'field',
      required: field.required === true,
      options: normalizeStringList(field.options),
    }))
    .filter((field) => field.name.length > 0 && field.label.length > 0)
}

function ensureIdField(fields: readonly RequiredWorkbenchField[]): readonly RequiredWorkbenchField[] {
  if (fields.some((field) => field.name === 'id')) return fields
  return [
    {
      name: 'id',
      label: 'ID',
      type: 'string',
      role: 'primary',
      required: true,
      options: [],
    },
    ...fields,
  ]
}

function toWorkbenchColumn(field: RequiredWorkbenchField): DataColumn {
  return {
    name: field.name,
    type: field.type,
    label: field.label,
    ...(field.name === 'id' || field.role === 'primary' ? { isPrimaryKey: true } : {}),
    ...(field.required ? { required: true, allowDBNull: false } : {}),
  }
}

function createWorkbenchSeedRows(fields: readonly RequiredWorkbenchField[]): readonly DataRow[] {
  return [0, 1, 2].map((index) => Object.fromEntries(fields.map((field) => [
    field.name,
    seedValueForField(field, index),
  ])))
}

function seedValueForField(field: RequiredWorkbenchField, index: number): unknown {
  if (field.name === 'id' || field.role === 'primary') return `row-${String(index + 1).padStart(3, '0')}`
  if (field.options.length > 0) return field.options[index % field.options.length]
  if (field.type === 'number' || field.type === 'int' || field.type === 'integer') return (index + 1) * 10
  if (field.type === 'boolean' || field.type === 'bool') return index % 2 === 0
  if (field.type === 'date' || field.type === 'datetime') return `2026-0${String(index + 1)}-0${String(index + 2)}`
  return `${field.label}${String(index + 1)}`
}

function replaceRootChildren(nodeTree: PageDesignNodeTree, nodes: SparkNode[]): void {
  const children = nodeTree.listChildren({})
  const rootChildIds = children
    .filter(isSparkNode)
    .map((node) => node.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (rootChildIds.length > 0) {
    nodeTree.removeNodes({ componentIds: rootChildIds })
  }
  nodeTree.addNodes({ parentComponentId: null, nodes })
}

function updateWorkbenchNavigation(
  state: PageDesignEditSession,
  input: NormalizedWorkbenchRequest,
): void {
  const host = state.host
  const draft = host?.getNavDraft?.() ?? null
  if (host === null || draft === null) return
  host.onNavDraftChanged?.({
    title: input.title,
    icon: input.entityName.toLowerCase().includes('employee') ? 'UserFilled' : 'DataAnalysis',
    description: `${input.title}标准管理工作台`,
    nodeKind: draft.nodeKind,
    path: draft.path,
    hidden: false,
    disabled: false,
  })
}

function createManagementWorkbenchNodes(input: Readonly<{
  title: string
  entityName: string
  tableName: string
  dataViewKey: string
  fields: readonly RequiredWorkbenchField[]
  filters: readonly string[]
  metrics: readonly string[]
  primaryAction: string
}>): SparkNode[] {
  const slug = kebabCase(input.tableName)
  const editableFields = input.fields.filter((field) => field.name !== 'id')
  return [
    {
      type: 'r-section',
      id: `${slug}-summary-section`,
      props: {
        title: input.title,
        description: `${input.entityName} 管理工作台`,
        gridColumns: Math.max(3, Math.min(4, input.metrics.length || 3)),
        gridGap: '16px',
        bodyClass: `${slug}-summary-grid`,
      },
      children: createMetricNodes(slug, input.metrics),
    },
    {
      type: 'r-section',
      id: `${slug}-filter-section`,
      props: {
        title: '筛选与操作',
        description: input.filters.length === 0 ? '按核心字段快速筛选并维护数据。' : input.filters.join(' / '),
        useCard: true,
        gridGap: '12px',
      },
      children: [
        {
          type: 'div',
          id: `${slug}-filter-row`,
          props: { class: `${slug}-filter-row` },
          children: createFilterNodes(slug, input.filters),
        },
      ],
    },
    {
      type: 'r-section',
      id: `${slug}-form-section`,
      props: {
        title: `${input.entityName} 档案维护`,
        description: `绑定 ${input.dataViewKey} 当前行，使用标准字段控件维护业务信息。`,
        useCard: true,
      },
      children: [
        {
          type: 'r-form',
          id: `${slug}-form`,
          props: {
            dataViewKey: input.dataViewKey,
            contextDataMember: DataMember.CurrentRow,
            gridColumns: 3,
            gridGap: '12px 16px',
            labelWidth: '96px',
          },
          children: [
            ...editableFields.map((field) => createFieldNode(slug, field)),
            {
              type: 'r-button',
              id: `${slug}-save-action`,
              props: {
                action: 'patch-current',
                dataViewKey: input.dataViewKey,
                label: input.primaryAction,
                buttonType: 'primary',
                icon: 'Save',
                successMessage: `${input.entityName} 信息已更新`,
              },
            },
          ],
        },
      ],
    },
    {
      type: 'r-section',
      id: `${slug}-table-section`,
      props: {
        title: `${input.entityName} 列表`,
        description: `列表绑定 ${input.dataViewKey} 的 rows。`,
      },
      children: [
        {
          type: 'r-table',
          id: `${slug}-table`,
          props: {
            dataViewKey: input.dataViewKey,
            dataMember: DataMember.Rows,
            rowKey: 'id',
            autoColumns: true,
            stripe: true,
            border: true,
            showPagination: true,
          },
        },
      ],
    },
  ]
}

function createMetricNodes(slug: string, metrics: readonly string[]): SparkNode[] {
  const items = metrics.length > 0 ? metrics : ['总数', '正常', '异常']
  return items.slice(0, 4).map((metric, index) => ({
    type: 'r-card',
    id: `${slug}-metric-${String(index + 1)}`,
    props: {
      header: metric,
      shadow: 'never',
      bodyClass: `${slug}-metric-card`,
    },
    children: [`${metric}：--`],
  }))
}

function createFilterNodes(slug: string, filters: readonly string[]): SparkNode[] {
  const items = filters.length > 0 ? filters : ['关键词', '状态', '日期']
  return items.slice(0, 6).map((filter, index) => ({
    type: 'r-text',
    id: `${slug}-filter-${String(index + 1)}`,
    props: {
      field: kebabCase(filter).replace(/-/g, ''),
      label: filter,
      placeholder: `筛选${filter}`,
    },
  }))
}

function createFieldNode(slug: string, field: RequiredWorkbenchField): SparkNode {
  const baseProps = {
    field: field.name,
    label: field.label,
    placeholder: `请输入${field.label}`,
  }
  if (field.options.length > 0) {
    return {
      type: 'r-select',
      id: `${slug}-field-${field.name}`,
      props: {
        ...baseProps,
        options: field.options.map((option) => ({ label: option, value: option })),
      },
    }
  }
  if (field.type === 'number' || field.type === 'int' || field.type === 'integer') {
    return { type: 'r-number', id: `${slug}-field-${field.name}`, props: baseProps }
  }
  if (field.type === 'date' || field.type === 'datetime') {
    return { type: 'r-date', id: `${slug}-field-${field.name}`, props: { ...baseProps, valueFormat: 'YYYY-MM-DD' } }
  }
  if (field.type === 'text' || field.role === 'description') {
    return { type: 'r-textarea', id: `${slug}-field-${field.name}`, props: { ...baseProps, rows: 3 } }
  }
  return { type: 'r-text', id: `${slug}-field-${field.name}`, props: baseProps }
}

function createManagementWorkbenchScript(input: NormalizedWorkbenchRequest): string {
  const statusField = input.fields.find((field) => field.role === 'status')?.name ?? 'status'
  const numericField = input.fields.find((field) => field.type === 'number')?.name ?? ''
  return [
    'export default {',
    '  methods: {',
    `    isAbnormal(row) {`,
    `      const value = row?.[${JSON.stringify(numericField)}];`,
    '      return typeof value === "number" ? value < 0 : false',
    '    },',
    `    statusLabel(row) {`,
    `      const value = row?.[${JSON.stringify(statusField)}];`,
    '      return value == null || value === "" ? "未设置" : String(value)',
    '    },',
    `    search${input.tableName}(rows, keyword) {`,
    '      const value = String(keyword ?? "").trim().toLowerCase()',
    '      if (value.length === 0) return rows',
    '      return rows.filter(row => Object.values(row ?? {}).some(item => String(item ?? "").toLowerCase().includes(value)))',
    '    },',
    '  },',
    '}',
  ].join('\n')
}

function createManagementWorkbenchStyle(input: NormalizedWorkbenchRequest): string {
  const slug = kebabCase(input.tableName)
  return [
    `.${slug}-workbench { display: grid; gap: 16px; padding: 20px; background: #f6f8fb; color: #1f2937; }`,
    `.${slug}-summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }`,
    `.${slug}-metric-card { min-height: 88px; display: flex; align-items: center; justify-content: space-between; font-weight: 600; }`,
    `.${slug}-filter-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: end; }`,
    `.${slug}-form-section [data-component-id="${slug}-form"] { max-width: 1120px; }`,
    `.${slug}-table-section { min-height: 320px; }`,
    `.${slug}-table-section [data-component-id="${slug}-table"] { border: 1px solid #d8dee9; background: #fff; }`,
    `@media (max-width: 900px) { .${slug}-summary-grid, .${slug}-filter-row { grid-template-columns: 1fr; } }`,
  ].join('\n')
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStringList(value: readonly string[] | undefined): readonly string[] {
  if (!Array.isArray(value)) return []
  return value.map(normalizeText).filter((item) => item.length > 0)
}

function normalizeIdentifier(value: unknown, fallback: string): string {
  const raw = normalizeText(value)
  const source = raw.length > 0 ? raw : fallback
  const ascii = source
    .replace(/[^A-Za-z0-9_]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part, index) => index === 0 ? lowerFirst(part) : upperFirst(part))
    .join('')
  if (ascii.length === 0) return fallback
  return /^[A-Za-z_]/.test(ascii) ? ascii : `T${ascii}`
}

function normalizeFieldType(value: unknown): string {
  const raw = normalizeText(value).toLowerCase()
  if (['number', 'int', 'integer', 'decimal', 'float', 'double'].includes(raw)) return 'number'
  if (['date', 'datetime', 'time'].includes(raw)) return raw
  if (['boolean', 'bool'].includes(raw)) return 'boolean'
  if (raw === 'text') return 'text'
  return 'string'
}

function kebabCase(value: string): string {
  const raw = value.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
  return raw
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'management'
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1)
}

function upperFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// ── 流程查询裁剪 ───────────────────────────────────────────

function listPageDesignFlowStepsForQuery(
  phase: string | undefined,
  taskGuides: readonly PageDesignTaskGuide[],
): readonly PageDesignFlowStep[] {
  // PAGE_DESIGN_REFACTOR_SOURCE[flow-detail-filter]: 控制 LLM 看到的流程细节范围；清理冗余时保留按需查询，不要回到全量灌入。
  if (phase !== undefined && phase.trim() !== '') return listPageDesignFlowSteps(phase)
  if (taskGuides.length === 0) return []
  const relevantSteps = new Set(taskGuides.flatMap((guide) => guide.relevantSteps))
  return listPageDesignFlowSteps().filter((step) => relevantSteps.has(step.step))
}
