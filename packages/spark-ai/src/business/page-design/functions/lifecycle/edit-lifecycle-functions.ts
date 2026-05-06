import type {
  FunctionCarrierContract,
  FunctionResult,
  RegisteredFunctionDefinition,
} from '../../../../core/protocol/function-contracts'
import type { SparkNodeTree } from '@spark-view/spark-component'
import type { DataSetCrudTool } from '@spark-view/spark-data'
import {
  EDIT_LIFECYCLE_FUNCTION_PARAMETER_TABLE,
  validateEditLifecycleFunctionParams,
} from './tool-catalog'

const PAGE_DESIGN_LIFECYCLE_MODULE_PROMPT = 'pageDesign@lifecycle 只负责读取当前编辑运行状态、绑定宿主提供的 live adapter，并验证 nodeTree、dataset、script、style 能力齐全；bootstrap 不复制第二份页面事实，也不修改页面内容。'
export const PAGE_DESIGN_LIFECYCLE_CARRIER_KEY = 'pageDesign@lifecycle' as const
const PAGE_DESIGN_DESCRIBE_PROGRESS_ACTION = 'pageDesign@lifecycle@describeProgress'

function getEditBootstrapFunctionRow() {
  const row = EDIT_LIFECYCLE_FUNCTION_PARAMETER_TABLE[0]
  if (row === undefined) {
    throw new Error('lifecycle/tool-catalog.ts 必须至少包含一条 bootstrap 函数定义')
  }
  return row
}

const EDIT_BOOTSTRAP_FUNCTION_ROW = getEditBootstrapFunctionRow()

export type EditInitParams = unknown

export type EditPhase = 'idle' | 'editing' | 'saved'

export interface EditToolHost {
  getNodeTree?: () => SparkNodeTree | null
  onNodeTreeChanged?: (nodeTree: SparkNodeTree) => void
  getDataSetTool?: () => DataSetCrudTool | null
  onDataSetChanged?: (tool: DataSetCrudTool) => void
  readScript?: () => string
  writeScript?: (content: string) => void
  readStyle?: () => string
  writeStyle?: (content: string) => void
}

export interface EditState {
  phase: EditPhase
  toolHost: EditToolHost | null
}

type TextModelReadKey = 'readScript' | 'readStyle'
type TextModelWriteKey = 'writeScript' | 'writeStyle'

function assertPresent<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
  return value
}

export function createEditState(): EditState {
  return {
    phase: 'idle',
    toolHost: null,
  }
}

export function getActiveNodeTree(state: EditState): SparkNodeTree | null {
  return state.toolHost?.getNodeTree?.() ?? null
}

export function notifyNodeTreeChanged(state: EditState, nodeTree: SparkNodeTree): void {
  state.toolHost?.onNodeTreeChanged?.(nodeTree)
}

export function getActiveDataSetTool(state: EditState): DataSetCrudTool | null {
  return state.toolHost?.getDataSetTool?.() ?? null
}

export function notifyDataSetChanged(state: EditState, tool: DataSetCrudTool): void {
  state.toolHost?.onDataSetChanged?.(tool)
}

function readTextModel(state: EditState, readKey: TextModelReadKey, missingMessage: string): string {
  return assertPresent(state.toolHost?.[readKey], missingMessage)()
}

function writeTextModel(
  state: EditState,
  readKey: TextModelReadKey,
  writeKey: TextModelWriteKey,
  missingMessage: string,
  content: string,
): void {
  const writer = assertPresent(state.toolHost?.[writeKey], missingMessage)
  assertPresent(state.toolHost?.[readKey], missingMessage)
  writer(content)
}

export function readActiveScript(state: EditState): string {
  return readTextModel(
    state,
    'readScript',
    'readActiveScript 失败：缺少 live text model 读取器（EditToolHost.readScript）',
  )
}

export function writeActiveScript(state: EditState, content: string): void {
  writeTextModel(
    state,
    'readScript',
    'writeScript',
    'writeActiveScript 失败：缺少 live text model 读写器（EditToolHost.readScript/writeScript）',
    content,
  )
}

export function readActiveStyle(state: EditState): string {
  return readTextModel(
    state,
    'readStyle',
    'readActiveStyle 失败：缺少 live text model 读取器（EditToolHost.readStyle）',
  )
}

export function writeActiveStyle(state: EditState, content: string): void {
  writeTextModel(
    state,
    'readStyle',
    'writeStyle',
    'writeActiveStyle 失败：缺少 live text model 读写器（EditToolHost.readStyle/writeStyle）',
    content,
  )
}

export function bindLiveModelAdapter(state: EditState, host: EditToolHost): void {
  state.toolHost = host
}

function missingLifecycleCarrierResult(action: string): FunctionResult<undefined> {
  return {
    ok: false,
    code: 'MISSING_CARRIER',
    msg: `${action} 缺少运行载体注入`,
    fix: `请先注册 ${PAGE_DESIGN_LIFECYCLE_CARRIER_KEY} 运行载体后再执行 ${action}。`,
  }
}

export function createEditLifecycleCarrier(state: EditState): FunctionCarrierContract<EditState> {
  return {
    carrierKey: PAGE_DESIGN_LIFECYCLE_CARRIER_KEY,
    isPrimary: true,
    prompt: PAGE_DESIGN_LIFECYCLE_MODULE_PROMPT,
    description: 'pageDesign 编辑态生命周期载体，负责 bootstrap 与编辑状态查询。',
    instance: state,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区二：会话引导（bootstrap 主流程）
// 目标：
// 1) 校验 live adapter 能力齐全；
// 2) 确认当前页面 4 文件都可从 live adapter 读取；
// 3) 进入 editing phase。
// 注意：
// - 不修改 live tree/data/script/style 内容；
// - 不在 bootstrap 内重复构造“第二份事实快照”。
// ─────────────────────────────────────────────────────────────────────────────

function bootstrapEditSession(state: EditState): void {
  assertPresent(
    getActiveNodeTree(state),
    `${EDIT_BOOTSTRAP_FUNCTION_ROW.action} 失败：缺少 nodeTree tool 实例（EditToolHost.getNodeTree）`,
  ).toJSON()

  assertPresent(
    getActiveDataSetTool(state),
    `${EDIT_BOOTSTRAP_FUNCTION_ROW.action} 失败：缺少 dataset tool 实例（EditToolHost.getDataSetTool）`,
  ).toJson()

  assertPresent(
    state.toolHost?.readScript,
    `${EDIT_BOOTSTRAP_FUNCTION_ROW.action} 失败：缺少 script 读取器（EditToolHost.readScript）`,
  )()

  assertPresent(
    state.toolHost?.readStyle,
    `${EDIT_BOOTSTRAP_FUNCTION_ROW.action} 失败：缺少 style 读取器（EditToolHost.readStyle）`,
  )()

  state.phase = 'editing'
}

// ─────────────────────────────────────────────────────────────────────────────
// 函数定义导出（由 lifecycle/tool-catalog.ts 驱动）
// ─────────────────────────────────────────────────────────────────────────────

export const editInit = {
  action: EDIT_BOOTSTRAP_FUNCTION_ROW.action,
} as const

function createEditInitFunction(): RegisteredFunctionDefinition<EditInitParams, undefined> {
  return {
    action: EDIT_BOOTSTRAP_FUNCTION_ROW.action,
    description: EDIT_BOOTSTRAP_FUNCTION_ROW.description,
    paramsSchema: EDIT_BOOTSTRAP_FUNCTION_ROW.paramsSchema,
    resultSchema: EDIT_BOOTSTRAP_FUNCTION_ROW.resultSchema,
    example: EDIT_BOOTSTRAP_FUNCTION_ROW.example,
    usageRules: EDIT_BOOTSTRAP_FUNCTION_ROW.usageRules,
    failureModes: EDIT_BOOTSTRAP_FUNCTION_ROW.failureModes,
    validate: (params) => validateEditLifecycleFunctionParams(EDIT_BOOTSTRAP_FUNCTION_ROW.action, params),
    execute: (): FunctionResult<undefined> => missingLifecycleCarrierResult(EDIT_BOOTSTRAP_FUNCTION_ROW.action),
    executeWithCarrier: (_context, carrier): FunctionResult<undefined> => {
      const state = carrier as EditState
      bootstrapEditSession(state)
      return { ok: true, data: undefined, summary: '编辑会话已完成函数引导（模型实例 + 函数入口），进入 editing 状态' }
    },
  }
}

function createDescribeProgressFunction(): RegisteredFunctionDefinition<Record<string, never>, unknown> {
  return {
    action: PAGE_DESIGN_DESCRIBE_PROGRESS_ACTION,
    description: '查询当前 pageDesign 编辑运行状态、live adapter 可用性和下一步建议。',
    paramsSchema: {},
    resultSchema: {
      phase: 'EditPhase',
      adapters: 'Record<string, boolean>',
      nextStep: 'string',
    },
    example: {},
    usageRules: [
      '当不确定当前编辑是否已完成 bootstrap，或需要确认可读写能力时调用。',
      '本函数只读业务运行状态，不修改页面内容。',
    ],
    failureModes: [],
    validate: () => null,
    execute: (): FunctionResult => missingLifecycleCarrierResult(PAGE_DESIGN_DESCRIBE_PROGRESS_ACTION),
    executeWithCarrier: (_context, carrier): FunctionResult => {
      const state = carrier as EditState
      return {
        ok: true,
        data: {
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
            : `请先执行 ${editInit.action} 初始化编辑会话。`,
        },
        summary: `pageDesign 编辑状态：${state.phase}`,
      }
    },
  }
}

export function createEditLifecycleFunctions() {
  return [
    createEditInitFunction(),
    createDescribeProgressFunction(),
  ]
}

export const EDIT_LIFECYCLE_FUNCTION_SUMMARIES = [
  {
    action: EDIT_BOOTSTRAP_FUNCTION_ROW.action,
    type: EDIT_BOOTSTRAP_FUNCTION_ROW.type,
  },
  {
    action: PAGE_DESIGN_DESCRIBE_PROGRESS_ACTION,
    type: 'describe',
  },
] as const
