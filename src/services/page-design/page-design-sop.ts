/**
 * pageDesign SOP 编排：决定 systemPrompt / toolLoopNudge / recovery 何时拼装。
 *
 * 知识 SSOT 不在此文件——业务契约来自 spark-project-model 源码 JSDoc，
 * 由 VCM 提取进 ClassModel（usageRules / failureModes），经 vcm_*_guide 暴露给 LLM。
 * 协议工具参数来自 packages/spark-ai/src/vcm-native/tools/vcm-native-tool-specs.ts。
 *
 * PAGE_DESIGN_HINTS 为过渡性手工副本（DEBT-JSDOC-DUPLICATION），
 * 新增 hint 应写回 JSDoc @failureMode，再改为从 ClassModel 派生。
 */
import type { EnrichFunctionCallFailureCommand } from '@spark-appworks/spark-ai/agent'
import type { AiAgentToolLoopNudgeReason } from '@spark-appworks/spark-ai/agent'
import { VCM_NATIVE_TOOL_NAMES } from '@spark-appworks/spark-ai/vcm-native'

const PAGE_DESIGN_HINTS = {
  actionNameNotProtocolTool:
    'actionName 必须是 openPageDesign 等业务 action，不能是 vcm_script 等协议工具。',
  scriptNoNamedFunction:
    'vcm_script 脚本体用 await 链式语句；勿写裸 function foo(){}，局部逻辑用 const fn = async () => {} 或直接内联 await。',
  scriptNoToJson:
    '脚本勿调 toJSON；用 openPageDesign → editDataSet/editNodeTree mutator 链式 API。',
  configPageNoCall:
    'ConfigPageNode 无 call()；改用 page.editNodeTree(async tree => ...) / page.editDataSet(async ds => ...)。',
  openPageFirst:
    'vcm_script 必须先 await this.openPageDesign({ pageId }) 得到 page，再 await page.editDataSet(async ds => ...)。',
  createTableNamedArgs:
    'createTable 签名：createTable({ tableName: "<TableName>", columns: [{ name, type, label }] })；勿用 positional 参数。',
  editDataSetBeforeNodeTree:
    '先 editDataSet 建表与 default 视图，再 editNodeTree 按 VCM 元数据声明的节点 type 和 props schema 构造节点。',
  mutatorCallbackNoRun:
    'editDataSet/editNodeTree 必须直接传函数：page.editDataSet(async ds => ...)；勿把 createTable 参数对象当成 run。',
  configPageChain:
    'openPageDesign 返回 ConfigPageNode 链式对象：用 page.editNodeTree(async tree => ...)/page.editDataSet(async ds => ...)，勿用 page.call()。',
  schemaMutatorCallback:
    'editDataSet/editNodeTree 必须直接传 async callback；勿把 createTable 参数对象当作 run。',
  planWithoutToolPreface:
    '写页面时优先 vcm_script；若已读完 vcm_action_guide，立即执行脚本链。',
  vcmScriptRetryPreface:
    '上一次 vcm_script 失败：按 RECOVERY_HINT 修正，禁止再查 catalog。',
  awaitMutatorReminder:
    'openPageDesign 必须 await；editDataSet/editNodeTree 直接传 async callback；完成后 agent_complete({ summary })。',
  systemPromptAwaitReminder:
    'openPageDesign 必须 await；读取必要 VCM 函数 schema 后必须 vcm_script 生成四文件结果，最后 agent_complete。',
  createTableNudgeReminder:
    'createTable 签名是 createTable({ tableName, columns })，不是 createTable(name, columns)。',
} as const

export type PageDesignHintKey = keyof typeof PAGE_DESIGN_HINTS

type PageDesignRecoveryRule = Readonly<{
  codes: readonly string[]
  protocolToolName?: string
  msgIncludes?: readonly string[]
  hintKeys: readonly PageDesignHintKey[]
}>

export const PAGE_DESIGN_RECOVERY_RULES: readonly PageDesignRecoveryRule[] = [
  {
    codes: ['FUNCTION_NOT_FOUND'],
    protocolToolName: VCM_NATIVE_TOOL_NAMES.actionGuide,
    hintKeys: ['actionNameNotProtocolTool'],
  },
  {
    codes: ['SCRIPT_EXECUTION_FAILED'],
    protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
    msgIncludes: ['Function statements require a function name'],
    hintKeys: ['scriptNoNamedFunction'],
  },
  {
    codes: ['SCRIPT_EXECUTION_FAILED'],
    protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
    msgIncludes: ['toJSON'],
    hintKeys: ['scriptNoToJson'],
  },
  {
    codes: ['SCRIPT_EXECUTION_FAILED'],
    protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
    msgIncludes: ['.call is not a function'],
    hintKeys: ['configPageNoCall'],
  },
  {
    codes: ['SCRIPT_EXECUTION_FAILED'],
    protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
    msgIncludes: ['editDataSet is not a function'],
    hintKeys: ['openPageFirst'],
  },
  {
    codes: ['SCRIPT_EXECUTION_FAILED'],
    protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
    msgIncludes: ['editNodeTree is not a function'],
    hintKeys: ['openPageFirst'],
  },
  {
    codes: ['SCRIPT_EXECUTION_FAILED'],
    protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
    msgIncludes: ["reading 'includes'"],
    hintKeys: ['createTableNamedArgs', 'editDataSetBeforeNodeTree'],
  },
  {
    codes: ['SCRIPT_EXECUTION_FAILED'],
    protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
    msgIncludes: ['run is not a function'],
    hintKeys: ['mutatorCallbackNoRun'],
  },
  {
    codes: ['SCRIPT_EXECUTION_FAILED'],
    hintKeys: ['configPageChain'],
  },
  {
    codes: ['SCHEMA_VALIDATION_FAILED'],
    protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
    msgIncludes: ['requires a callback'],
    hintKeys: ['schemaMutatorCallback'],
  },
  {
    codes: ['SCHEMA_VALIDATION_FAILED'],
    protocolToolName: VCM_NATIVE_TOOL_NAMES.script,
    msgIncludes: ['must be a function'],
    hintKeys: ['schemaMutatorCallback'],
  },
]

function formatPageDesignHint(key: PageDesignHintKey, pageId?: string): string {
  if (key === 'openPageFirst') {
    const normalizedPageId = pageId?.trim() ?? ''
    if (normalizedPageId.length > 0) {
      return `vcm_script 必须先 await this.openPageDesign({ pageId: "${normalizedPageId}" }) 得到 page，再 await page.editDataSet(async ds => ...)。`
    }
  }
  return PAGE_DESIGN_HINTS[key]
}

function resolveHintLines(
  keys: readonly PageDesignHintKey[],
  command: EnrichFunctionCallFailureCommand,
): readonly string[] {
  return keys.map((key) => formatPageDesignHint(key, command.moduleInstanceId))
}

function matchesRecoveryRule(
  command: EnrichFunctionCallFailureCommand,
  rule: PageDesignRecoveryRule,
): boolean {
  const { protocolToolName, callResult } = command
  if (!rule.codes.includes(callResult.code)) return false
  if (rule.protocolToolName !== undefined && rule.protocolToolName !== protocolToolName) return false
  if (rule.msgIncludes === undefined) return true
  return rule.msgIncludes.some((fragment) => callResult.msg.includes(fragment))
}

export function resolvePageDesignRecoveryHints(
  command: EnrichFunctionCallFailureCommand,
): readonly string[] {
  const hints: string[] = []
  for (const rule of PAGE_DESIGN_RECOVERY_RULES) {
    if (!matchesRecoveryRule(command, rule)) continue
    for (const line of resolveHintLines(rule.hintKeys, command)) {
      hints.push(line)
    }
  }
  return hints
}

export function pageDesignScriptShapeLines(pageId: string): readonly string[] {
  return [
    `vcm_script 主路径：const page = await this.openPageDesign({ pageId: "${pageId}" });`,
    'await page.editDataSet(async (ds) => { ds.createTable({ tableName: "<TableName>", columns: [{ name, type, label }] }); });',
    'r-form 绑定草稿行：dataViewKey="<Table>@default"、dataMember="currentRow"（或 contextDataMember="currentRow"）；字段节点用 props.field，勿用 prop。',
    'await page.editNodeTree(async (tree) => { tree.addNode({ parentComponentId: null, node: { type: "r-table", id: "...", props: { dataViewKey: "<table@viewId>", dataMember: "rows" } } }); });',
    '提交按钮优先 append-row 闭环；若用 script.js 处理提交，rule.json 仍需表单绑定与列表区。',
  ]
}

/** @deprecated Use pageDesignScriptShapeLines */
export const pageDesignScriptSopLines = pageDesignScriptShapeLines

export function pageDesignSystemPromptTailLines(_pageId: string): readonly string[] {
  return [
    `page.setFileText("script.js", ""); page.setFileText("style.css", "");`,
    `return { ruleJson: page.getFileText("rule.json"), pageDataJson: page.getFileText("pagedata.json"), script: page.getFileText("script.js"), style: page.getFileText("style.css") };`,
    '脚本代理支持原生形态：editDataSet(async ds=>...)、editNodeTree(async tree=>...)、createTable({ tableName, columns })、addNode({ parentComponentId, node })。',
    PAGE_DESIGN_HINTS.systemPromptAwaitReminder,
    'pageId 来自当前输入；勿把 pageId 当成 projectId。',
    '元数据来源: generated pageDesign module metadata.',
    '执行原则: LLM 生成代码 -> vcm_script 执行代码 -> ConfigPageNode 内存模型得到 rule.json / pagedata.json / script.js / style.css；落盘由外层 ProjectWorkspace 处理。',
  ]
}

export function buildPageDesignToolLoopNudge(
  reason: AiAgentToolLoopNudgeReason,
  pageId: string,
): string | undefined {
  const scriptShape = pageDesignScriptShapeLines(pageId)
  switch (reason) {
    case 'plan_without_tool':
      return [
        PAGE_DESIGN_HINTS.planWithoutToolPreface,
        ...scriptShape,
      ].join('\n')
    case 'execution_phase':
      return [
        `目录/指南阶段已完成，pageId="${pageId}"。禁止再重复查目录，直接执行 vcm_script。`,
        ...scriptShape,
        PAGE_DESIGN_HINTS.awaitMutatorReminder,
      ].join('\n')
    case 'vcm_script_retry':
      return [
        PAGE_DESIGN_HINTS.vcmScriptRetryPreface,
        ...scriptShape,
        PAGE_DESIGN_HINTS.createTableNudgeReminder,
      ].join('\n')
    default:
      return undefined
  }
}

export function readPageDesignHint(key: PageDesignHintKey, pageId?: string): string {
  return formatPageDesignHint(key, pageId)
}
