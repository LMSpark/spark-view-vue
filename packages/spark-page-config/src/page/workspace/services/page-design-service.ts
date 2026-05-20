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
  type PageDesignServiceState,
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
  PageDesignServiceState,
  PageDesignTextFileKey,
} from './page-design-service-contract'

export interface PageDesignFlowQuery {
  phase?: string
  step?: number
  afterStep?: number
}

export interface PageDesignFlowDescription {
  phases: PageDesignFlowPhaseSummary[]
  steps: readonly PageDesignFlowStep[]
  selectedStep: PageDesignFlowStep | null
  nextStep: PageDesignFlowStep | null
}

type PageDesignTextReadMethod = 'readScript' | 'readStyle'
type PageDesignTextWriteMethod = 'writeScript' | 'writeStyle'

interface PageDesignTextFileBinding {
  label: string
  readMethod: PageDesignTextReadMethod
  writeMethod: PageDesignTextWriteMethod
  validateWrite?: (content: string) => PageDesignServiceResult<undefined> | null
}

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
  return pageDesignServiceSuccess({ phase: state.phase }, '编辑会话已完成宿主检查，进入 editing 状态')
}

function ensureTextModelAccess(
  state: PageDesignEditSession,
  fileKey: PageDesignTextFileKey,
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
