import type { DataSetCrudTool } from '@spark-view/spark-data'
import {
  getNextPageDesignFlowStep,
  getPageDesignFlowStep,
  listPageDesignFlowSteps,
  summarizePageDesignFlowPhases,
  type PageDesignFlowPhaseSummary,
  type PageDesignFlowStep,
} from '../design/page-design-100-step-flow'
import { PageDesignEditSession } from '../editing/page-design-edit-session'
import type { PageDesignNodeTree } from '../editing/page-design-node-tree'
import {
  pageDesignServiceFailure,
  pageDesignServiceSuccess,
  type PageDesignServiceContext,
  type PageDesignServiceMethodBinding,
  type PageDesignServiceOptions,
  type PageDesignServiceResult,
  type PageDesignTextFileKey,
} from './page-design-service-contract'
import { useMethodBackedTarget } from './page-design-method-target'
import { validateScriptServiceContract } from './page-design-script-contract'

export {
  isPageDesignServiceResult,
  pageDesignServiceFailure,
} from './page-design-service-contract'

export type {
  PageDesignServiceContext,
  PageDesignServiceMethodBinding,
  PageDesignServiceOptions,
  PageDesignServiceResult,
  PageDesignTextFileKey,
} from './page-design-service-contract'

export interface PageDesignFlowQuery {
  /** 可选阶段名；用于先按阶段缩小 100 步流程范围。 */
  phase?: string
  /** 精确步骤号；传入后只返回该步骤及它之后的下一步。 */
  step?: number
  /** 已完成步骤号；用于恢复上下文时计算下一步。 */
  afterStep?: number
}

export interface PageDesignFlowDescription {
  /** 阶段摘要，供调用方先判断当前页面设计应推进到哪一段。 */
  phases: PageDesignFlowPhaseSummary[]
  /** 查询命中的步骤列表；按 phase 过滤或由 step 精确定位。 */
  steps: readonly PageDesignFlowStep[]
  /** step 命中的单步；未传 step 或未命中时为 null。 */
  selectedStep: PageDesignFlowStep | null
  /** afterStep 或 selectedStep 之后的下一步；没有后续步骤时为 null。 */
  nextStep: PageDesignFlowStep | null
}

/**
 * 文本模型文件到宿主读写方法的绑定。
 *
 * script.js 与 style.css 在 PageDesignService 内走同一套读写时序：
 * 校验宿主方法存在 → 读取或写入 live text model → 对 script 写入追加契约校验。
 * 读写方法直接内联为稳定字符串集合，避免额外 type alias 分散阅读路径。
 */
interface PageDesignTextFileBinding {
  label: string
  readMethod: 'readScript' | 'readStyle'
  writeMethod: 'writeScript' | 'writeStyle'
  validateWrite?: (content: string) => PageDesignServiceResult<undefined> | null
}

/** 文本文件入口表：所有 textModel read/write 都先通过 fileKey 落到这里。 */
const TEXT_FILE_BINDING_BY_KEY: Record<PageDesignTextFileKey, PageDesignTextFileBinding> = {
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

/**
 * 汇总当前编辑状态。
 *
 * describeProgress 是只读诊断入口，按“会话阶段 → live binding 可用性 → 下一步”
 * 的顺序返回，方便 LLM 或调试面板先判断是否需要 bootstrap。
 */
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

/**
 * 引导 PageDesign 编辑会话进入 editing。
 *
 * 启动时序必须保持严格：
 * 1. 校验 nodeTree，保证 rule.json 结构编辑入口存在。
 * 2. 校验 DataSet tool，保证 pagedata.json 编辑入口存在。
 * 3. 校验 script/style 的读写方法，保证文本模型可双向同步。
 * 4. 主动读取四类模型，提前暴露宿主实现异常；全部通过后再切 phase。
 */
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
  return pageDesignServiceSuccess({ phase: state.phase }, '编辑会话已完成宿主检查，进入 editing 状态')
}

/** 校验指定文本模型在当前模式下是否有宿主方法，缺失时返回可直接展示的错误原因。 */
function ensureTextModelAccess(
  state: PageDesignEditSession,
  fileKey: PageDesignTextFileKey,
  mode: 'read' | 'write',
): string | null {
  const binding = TEXT_FILE_BINDING_BY_KEY[fileKey]
  const method = mode === 'read' ? binding.readMethod : binding.writeMethod
  return typeof state.host?.[method] === 'function' ? null : `缺少 live text model: ${String(method)}`
}

/** 读取已绑定的 live text model；调用前由 ensureTextModelAccess 做用户态错误返回。 */
function readBoundTextModel(state: PageDesignEditSession, binding: PageDesignTextFileBinding): string {
  const reader = state.host?.[binding.readMethod]
  if (typeof reader !== 'function') {
    throw new Error(`缺少 live text model: ${String(binding.readMethod)}`)
  }
  return reader()
}

/** 写入已绑定的 live text model；script.js 的 API 契约校验在调用本函数前完成。 */
function writeBoundTextModel(state: PageDesignEditSession, binding: PageDesignTextFileBinding, content: string): void {
  const writer = state.host?.[binding.writeMethod]
  if (typeof writer !== 'function') {
    throw new Error(`缺少 live text model: ${String(binding.writeMethod)}`)
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

  releasePage(pageId: string): void {
    this.states.delete(pageId)
  }
}
