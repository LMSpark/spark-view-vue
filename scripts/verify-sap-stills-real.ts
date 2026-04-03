/**
 * 真实 LLM 调用 — SAP 协议 + Stills 引擎 → DataSet 元数据
 *
 * 用法：npx tsx scripts/verify-sap-stills-real.ts
 *
 * 前置条件：
 *   1. OPENAI_API_KEY 环境变量已配置（DeepSeek API Key）
 *   2. 可选：OPENAI_BASE_URL（默认 https://api.deepseek.com）
 *   3. 可选：AI_MODEL（默认 deepseek-chat）
 *
 * 工作流（直接调用 DeepSeek API，多轮对话累积）：
 *   1. 注册全部 Stills 到本地引擎
 *   2. 读取 Stills 运行时系统提示词
 *   3. 循环：调用 LLM → 解析 @@request/@@describe 块 → 本地 executeStill() → 回注结果
 *   4. 导出完整 AI↔Stills 对话记录 + 最终 IDataSetMetadata
 *
 * 输出：
 *   data/sap-stills-dialogue.json   — 完整 AI↔Stills 对话记录
 *   data/sap-stills-metadata.json   — 最终 IDataSetMetadata
 */

import { registerAllStills, createSession, executeStill, getStill, getAllStills } from '../packages/spark-ai/src/index.js'
import { getDataSetState } from '../packages/spark-ai/src/stills/dataset-domain.js'
import type { IStillSession, StillDefinition } from '../packages/spark-ai/src/stills/types.js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ═══════════════════════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════════════════════

const DEEPSEEK_API_KEY = process.env['OPENAI_API_KEY'] ?? ''
const DEEPSEEK_BASE_URL = (process.env['OPENAI_BASE_URL'] ?? 'https://api.deepseek.com').replace(/\/+$/, '')
const DEEPSEEK_MODEL = process.env['AI_MODEL'] ?? 'deepseek-chat'
const MAX_ROUNDS = 120            // 最大工具循环轮次
const STREAM_TIMEOUT = 180_000    // 单次 SSE 流超时 (ms)
const SLIDING_WINDOW = 60         // 滑动窗口：保留最近 N 条消息（约 30 轮对话）

// 强制 AI 只输出协议块，不输出自然语言
const PROTOCOL_ONLY_INSTRUCTION = `

══ 输出格式（严格执行）══

你的每次回复 **必须且仅能** 包含一个 SAP 协议块：

  @@<type>:<action>#<id>
  <JSON>
  @@end

禁止输出任何自然语言文字（包括解释、总结、过渡语句、思考过程）。
除非明确收到"请总结"指令，否则你的回复中只有协议块。
`.trim()

const REVIEW_ONLY_INSTRUCTION = `

══ 审查输出格式（严格执行）══

你当前处于“只做审查”的阶段：

1. 只输出自然语言中文结论，禁止输出任何 SAP 协议块。
2. 禁止输出 @@request / @@describe / @@result / @@error / @@end。
3. 只允许依据“原始需求回顾”和“导出结果摘要”里的显式事实做判断，禁止补充习惯性设计、隐含业务假设或额外数据资源。
4. 如果摘要里已经列出 relation，就视为该 relation 已存在；禁止再要求列级重复声明、隐式 metadata 或其他未展示结构。
5. 如果通过，以“✅ 审查通过：”开头。
6. 如果失败，以“❌ 审查失败：”开头，并逐条列出问题。
`.trim()

const SUMMARY_ONLY_INSTRUCTION = `

══ 总结输出格式（严格执行）══

你当前只需要输出中文自然语言总结，禁止输出任何 SAP 协议块。
`.trim()

const USER_PROMPT = `请为"请假申请单"页面设计完整的数据模型（DataSet），覆盖该页面所需的全部数据资源。

页面描述：员工填写请假申请表单并提交。

该页面需要以下数据资源：
1. 请假申请表（主表）：申请编号、申请人、假别、起止日期、请假天数、事由、状态
   - 请假天数为计算列，根据起止日期自动计算（纯 JS 表达式）
   - 需要按天数汇总统计（聚合）
   - 主表 default 视图需配置 autoCurrentFirst: true（加载后自动选中首行）
2. 假别字典（选项数据源）：编码、名称，含初始数据（年假/病假/事假/婚假/产假，编码唯一）
  - 作为申请表"假别"字段的下拉选项（需 options 视图，配置 valueField + labelField，不得复用 default 视图）
3. 员工表（选项数据源）：工号、姓名、部门ID（关联部门表）、职务，含示例数据
  - 作为申请表"申请人"字段的下拉选项（需 options 视图，配置 valueField + labelField，不得复用 default 视图）
4. 部门表（树形数据源）：部门名称，含示例数据（总公司及下属部门，有层级关系）
   - 是自引用树结构（parentId 指向同表 id），必须有 relation.add 声明自引用关系
  - 作为员工表"部门"字段的下拉树选项（需 options 视图，配置 valueField + labelField + treeConfig，不得复用 default 视图）

注意：字典表作为下拉选项数据源，不需要配置 dependency（无级联过滤）。`

// ═══════════════════════════════════════════════════════════
// Stills 运行时系统提示词（从 STILLS_RUNTIME_PROMPT.md 读取）
// ═══════════════════════════════════════════════════════════

function loadStillsSystemPrompt(): string {
  const mdPath = path.resolve(__dirname, '../docs/ai/prompts/platform/STILLS_RUNTIME_PROMPT.md')
  const md = fs.readFileSync(mdPath, 'utf-8')
  // 提取 ```text ... ``` code block 内容（兼容 \r\n 和 \n）
  const match = md.match(/```text\r?\n([\s\S]*?)\r?\n```/)
  if (!match) throw new Error('STILLS_RUNTIME_PROMPT.md 中未找到 ```text code block')
  return match[1].trim()
}

const STILLS_PROTOCOL_SYSTEM_PROMPT = loadStillsSystemPrompt() + '\n\n' + PROTOCOL_ONLY_INSTRUCTION
const STILLS_REVIEW_SYSTEM_PROMPT = `${loadStillsSystemPrompt()}\n\n${REVIEW_ONLY_INSTRUCTION}`
const STILLS_SUMMARY_SYSTEM_PROMPT = `${loadStillsSystemPrompt()}\n\n${SUMMARY_ONLY_INSTRUCTION}`

// ═══════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════

interface SapBlock {
  type: string    // 'request' | 'describe'
  action: string  // e.g. 'session.describe'
  id: string      // e.g. 'sd-001'
  body: string    // raw JSON string
  raw: string     // original matched text
}

interface DialogueTurn {
  round: number
  timestamp: string
  phase: 'ai-response' | 'stills-execute' | 'summary-request' | 'self-check'
  // AI 侧
  aiText?: string           // AI 的完整文本输出
  aiReasoning?: string      // DeepSeek 推理过程
  sapBlock?: {
    type: string
    action: string
    id: string
    params: unknown
  }
  // Stills 引擎侧
  stillsResult?: {
    ok: boolean
    data?: unknown
    code?: string
    msg?: string
    fix?: string
    correction?: SapImmediateCorrection
    summary?: string
  }
  // 耗时
  elapsed?: number         // ms
}

interface FullDialogue {
  startedAt: string
  userPrompt: string
  systemPrompt: string
  rounds: number
  turns: DialogueTurn[]
  finalSummary: string
  totalElapsed: number
}

interface RuntimeAbortState {
  aborted: boolean
  reason: string
}

interface SapImmediateCorrection {
  requestedAction: string
  suggestedAction: string | null
  suggestedType: 'request' | 'describe' | null
  guard: string | null
  paramsSchema: Record<string, unknown> | null
  example: Record<string, unknown> | null
  usageRules: string[]
  failureModes: Array<{ code: string; when: string; fix: string }>
  candidateActions?: string[]
  suggestedProtocolBlock: string | null
}

// ═══════════════════════════════════════════════════════════
// DeepSeek API 直连 — SSE 流解析
// ═══════════════════════════════════════════════════════════

interface StreamResult {
  text: string
  reasoning: string
}

async function streamChat(
  messages: Array<{ role: string; content: string }>,
): Promise<StreamResult> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('OPENAI_API_KEY 环境变量未配置（DeepSeek API Key）')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT)

  try {
    const resp = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        stream: true,
        max_tokens: 8192,
      }),
      signal: controller.signal,
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`DeepSeek API 失败 (${resp.status}): ${errText}`)
    }

    // 解析 OpenAI 格式 SSE 流
    const reader = resp.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''
    let reasoning = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // 保留未完成行

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const dataStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5)
        if (dataStr === '[DONE]') continue

        try {
          const parsed = JSON.parse(dataStr) as {
            choices?: Array<{
              delta?: {
                content?: string | null
                reasoning_content?: string | null
              }
            }>
          }
          const delta = parsed.choices?.[0]?.delta
          if (delta?.content) fullText += delta.content
          if (delta?.reasoning_content) reasoning += delta.reasoning_content
        } catch (e) {
          if (e instanceof SyntaxError) continue // 忽略非 JSON 行
          throw e
        }
      }
    }

    return { text: fullText, reasoning }
  } finally {
    clearTimeout(timeoutId)
  }
}

// ═══════════════════════════════════════════════════════════
// SAP 协议块提取 — 与 packages/spark-ai/src/protocol.ts 对齐
// ═══════════════════════════════════════════════════════════

const TOOL_BLOCK_RE = /@@(\w+):([\w.]+)(?:#([\w-]*))?\n([\s\S]*?)\n@@end/g

function extractSapBlocks(text: string): SapBlock[] {
  const blocks: SapBlock[] = []
  TOOL_BLOCK_RE.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = TOOL_BLOCK_RE.exec(text)) !== null) {
    const type = match[1] ?? ''
    if (type !== 'request' && type !== 'describe') continue
    blocks.push({
      type,
      action: match[2] ?? '',
      id: match[3] || `auto-${blocks.length + 1}`,  // fallback ID when empty/missing
      body: match[4] ?? '',
      raw: match[0],
    })
  }

  return blocks
}

function stripSapBlocks(text: string): string {
  TOOL_BLOCK_RE.lastIndex = 0
  return text.replace(TOOL_BLOCK_RE, (raw, type: string) => {
    if (type === 'request' || type === 'describe') return ''
    return raw
  }).replace(/\n{3,}/g, '\n\n').trim()
}

function parseBlockBody(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return {}
  }
}

function asDict(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>
}

function formatSapProtocolBlock(
  type: 'request' | 'describe',
  action: string,
  requestId: string,
  params: unknown,
): string {
  return `@@${type}:${action}#${requestId}\n${JSON.stringify(params, null, 2)}\n@@end`
}

function tokenizeAction(action: string): string[] {
  return action.toLowerCase().split(/[._-]+/u).filter((token) => token.length > 0)
}

function scoreActionCandidate(requestedAction: string, candidateAction: string): number {
  const requestedTokens = tokenizeAction(requestedAction)
  const candidateTokens = tokenizeAction(candidateAction)
  let score = 0

  if (candidateAction.startsWith(requestedAction) || requestedAction.startsWith(candidateAction)) {
    score += 20
  }

  const [requestedNamespace] = requestedTokens
  const [candidateNamespace] = candidateTokens
  if (requestedNamespace && candidateNamespace && requestedNamespace === candidateNamespace) {
    score += 10
  }

  for (const token of requestedTokens) {
    if (candidateTokens.includes(token)) score += 3
  }

  return score
}

function findCandidateActions(requestedAction: string, max = 5): string[] {
  return Array.from(getAllStills().keys())
    .map((candidate) => ({ candidate, score: scoreActionCandidate(requestedAction, candidate) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.candidate.localeCompare(right.candidate))
    .slice(0, max)
    .map((item) => item.candidate)
}

function buildCorrectionFromStill(
  action: string,
  still: StillDefinition | undefined,
  requestId: string,
  candidates: string[] = [],
  compilerFix?: string,
): SapImmediateCorrection {
  const fixBlocks = compilerFix ? extractSapBlocks(compilerFix) : []
  const suggestedBlockText = fixBlocks.length > 0 ? fixBlocks.map((block) => block.raw).join('\n\n') : null
  const firstFixBlock = fixBlocks[0]
  const fixSuggestedAction = firstFixBlock?.action ?? null
  const fixSuggestedStill = fixSuggestedAction ? getStill(fixSuggestedAction) : undefined

  if (!still) {
    const suggestedAction = fixSuggestedAction ?? candidates[0] ?? null
    const suggestedStill = fixSuggestedStill ?? (suggestedAction ? getStill(suggestedAction) : undefined)
    return {
      requestedAction: action,
      suggestedAction,
      suggestedType: firstFixBlock?.type === 'request' || firstFixBlock?.type === 'describe'
        ? firstFixBlock.type
        : (suggestedStill?.type ?? null),
      guard: suggestedStill?.guardDescription ?? null,
      paramsSchema: suggestedStill?.paramsSchema ?? null,
      example: suggestedStill?.example ?? null,
      usageRules: suggestedStill?.usageRules ?? [],
      failureModes: suggestedStill?.failureModes ?? [],
      candidateActions: candidates,
      suggestedProtocolBlock: suggestedBlockText ?? (suggestedStill
        ? formatSapProtocolBlock(suggestedStill.type, suggestedStill.action, `${requestId}-retry`, suggestedStill.example ?? {})
        : null),
    }
  }

  const suggestedAction = fixSuggestedAction ?? still.action
  const suggestedStill = fixSuggestedStill ?? still

  return {
    requestedAction: action,
    suggestedAction,
    suggestedType: firstFixBlock?.type === 'request' || firstFixBlock?.type === 'describe'
      ? firstFixBlock.type
      : suggestedStill.type,
    guard: suggestedStill.guardDescription ?? null,
    paramsSchema: suggestedStill.paramsSchema ?? null,
    example: suggestedStill.example ?? null,
    usageRules: suggestedStill.usageRules ?? [],
    failureModes: suggestedStill.failureModes ?? [],
    suggestedProtocolBlock: suggestedBlockText ?? formatSapProtocolBlock(suggestedStill.type, suggestedStill.action, `${requestId}-retry`, suggestedStill.example ?? {}),
  }
}

function getViews(table: unknown): Record<string, Record<string, unknown>> | undefined {
  return asDict(table)['views'] as Record<string, Record<string, unknown>> | undefined
}

function hasPendingBlueprintWork(blueprint: IStillSession['blueprint']): boolean {
  if (!blueprint) return false
  return blueprint.checkpoints.some((checkpoint) => checkpoint.status !== 'done')
}

function hasSuccessfulStill(turns: DialogueTurn[], action: string): boolean {
  return turns.some((turn) => turn.phase === 'stills-execute'
    && turn.sapBlock?.action === action
    && turn.stillsResult?.ok === true)
}

function isSapProtocolText(text: string): boolean {
  return /@@(?:request|describe|result|error):/u.test(text)
}

function isCompatibleValue(columnType: unknown, value: unknown): boolean {
  if (value === null || value === undefined) return true

  switch (columnType) {
    case 'string':
    case 'date':
    case 'datetime':
    case 'time':
      return typeof value === 'string'
    case 'number':
    case 'decimal':
    case 'int':
    case 'integer':
    case 'float':
    case 'double':
      return typeof value === 'number'
    case 'boolean':
      return typeof value === 'boolean'
    case 'json':
    case 'object':
      return typeof value === 'object'
    default:
      return true
  }
}

function normalizeAggregateEntries(aggregates: unknown): Array<{ field: string; aggregate: string }> {
  if (Array.isArray(aggregates)) {
    return aggregates.map((aggregate) => {
      const dict = asDict(aggregate)
      return {
        field: String(dict['field'] ?? ''),
        aggregate: String(dict['aggregate'] ?? dict['aggregator'] ?? dict['type'] ?? ''),
      }
    })
  }

  if (aggregates && typeof aggregates === 'object') {
    return Object.entries(aggregates as Record<string, unknown>).map(([field, aggregate]) => {
      const dict = asDict(aggregate)
      return {
        field,
        aggregate: String(dict['aggregate'] ?? dict['aggregator'] ?? dict['type'] ?? ''),
      }
    })
  }

  return []
}

function formatAggregateSummary(aggregates: unknown): string {
  return normalizeAggregateEntries(aggregates)
    .filter((aggregate) => aggregate.field.length > 0)
    .map((aggregate) => `${aggregate.field}:${aggregate.aggregate}`)
    .join(',')
}

function buildSeedRowsTemplate(tableName: string, table: { columns: unknown[] } | undefined, requestId: string): string | null {
  if (!table) return null

  const exampleRow: Record<string, unknown> = {}
  for (const columnValue of table.columns) {
    const column = asDict(columnValue)
    const columnName = String(column['name'] ?? '')
    if (!columnName || column['computeExpression'] != null) continue

    if (columnName === 'parentId') {
      exampleRow[columnName] = null
      continue
    }

    switch (String(column['type'] ?? 'string')) {
      case 'number':
      case 'decimal':
      case 'int':
      case 'integer':
      case 'float':
      case 'double':
        exampleRow[columnName] = 1
        break
      case 'boolean':
        exampleRow[columnName] = false
        break
      case 'date':
        exampleRow[columnName] = '2024-01-01'
        break
      case 'datetime':
        exampleRow[columnName] = '2024-01-01T00:00:00Z'
        break
      default:
        exampleRow[columnName] = `<${columnName}>`
        break
    }
  }

  return formatSapProtocolBlock('request', 'datatable.addRows', `${requestId}-seed-${tableName.toLowerCase()}`, {
    tableName,
    rows: [exampleRow],
  })
}

function formatSortSummary(view: Record<string, unknown>): string {
  const sortExpression = typeof view['sortExpression'] === 'string' ? view['sortExpression'] : ''
  if (sortExpression) return sortExpression

  const sortConfig = view['sort'] && typeof view['sort'] === 'object'
    ? view['sort'] as Record<string, unknown>
    : {}
  const field = typeof sortConfig['field'] === 'string' ? sortConfig['field'] : ''
  const order = typeof sortConfig['order'] === 'string' ? sortConfig['order'] : ''

  if (field && order) return `${field}:${order}`
  if (field) return field
  return ''
}

function describeBlueprintCheckpoint(checkpoint: Record<string, unknown>): string {
  const plannedActions = Array.isArray(checkpoint['plannedActions']) ? checkpoint['plannedActions'].join(' ') : ''
  const planItems = Array.isArray(checkpoint['planItems'])
    ? checkpoint['planItems']
      .map((item) => {
        const dict = asDict(item)
        return [dict['title'], dict['action'], dict['note'], dict['subagentGoal']].filter(Boolean).join(' ')
      })
      .join(' ')
    : ''
  return [
    checkpoint['id'],
    checkpoint['title'],
    checkpoint['validation'],
    checkpoint['subagentGoal'],
    plannedActions,
    planItems,
  ].filter(Boolean).join(' ')
}

function collectBlueprintCoverageIssues(blueprint: IStillSession['blueprint']): string[] {
  if (!blueprint) return ['蓝图不存在']

  const checkpoints = blueprint.checkpoints.map((checkpoint) => ({
    id: checkpoint.id,
    dependsOn: checkpoint.dependsOn ?? [],
    text: describeBlueprintCheckpoint(asDict(checkpoint)),
  }))
  const allText = checkpoints.map((checkpoint) => checkpoint.text).join('\n')
  const issues: string[] = []

  if (!/applicantId|申请人ID|Employee→LeaveApplication/u.test(allText)) {
    issues.push('蓝图未显式覆盖 LeaveApplication.applicantId 与 Employee 的关系')
  }
  if (!/leaveTypeId|假别ID|LeaveType→LeaveApplication/u.test(allText)) {
    issues.push('蓝图未显式覆盖 LeaveApplication.leaveTypeId 与 LeaveType 的关系')
  }
  if (!/departmentId|部门ID|Department→Employee/u.test(allText)) {
    issues.push('蓝图未显式覆盖 Employee.departmentId 与 Department 的关系')
  }
  if (!/parentId|自引用|Department→Department/u.test(allText)) {
    issues.push('蓝图未显式覆盖 Department.parentId 自引用关系')
  }
  if (!/options/u.test(allText) || !/LeaveType/u.test(allText) || !/Employee/u.test(allText) || !/Department/u.test(allText)) {
    issues.push('蓝图未完整覆盖 LeaveType / Employee / Department 的 options 视图')
  }
  if (!/valueField/u.test(allText) || !/labelField/u.test(allText)) {
    issues.push('蓝图未显式要求 options 视图配置 valueField 和 labelField')
  }
  if (!/treeConfig/u.test(allText)) {
    issues.push('蓝图未显式要求 Department.options 配置 treeConfig')
  }
  if (!/leaveDays|请假天数/u.test(allText) || !/computeExpression|计算列/u.test(allText)) {
    issues.push('蓝图未显式覆盖 leaveDays 计算列')
  }
  if (!/dataview\.setAggregates|聚合/u.test(allText)) {
    issues.push('蓝图未显式覆盖主表聚合配置')
  }
  if (!/datatable\.addRows|内联|示例数据/u.test(allText)) {
    issues.push('蓝图未显式覆盖种子数据写入')
  }
  if (!/dataset\.validate|最终校验/u.test(allText)) {
    issues.push('蓝图未显式覆盖 dataset.validate')
  }
  if (!/dataset\.export|导出/u.test(allText)) {
    issues.push('蓝图未显式覆盖 dataset.export')
  }

  const aggregateCheckpoint = checkpoints.find((checkpoint) => /dataview\.setAggregates|聚合/u.test(checkpoint.text))
  const computeCheckpoint = checkpoints.find((checkpoint) => /datatable\.addColumns|computeExpression|计算列/u.test(checkpoint.text))
  if (aggregateCheckpoint && computeCheckpoint) {
    const aggregateIndex = checkpoints.findIndex((checkpoint) => checkpoint.id === aggregateCheckpoint.id)
    const computeIndex = checkpoints.findIndex((checkpoint) => checkpoint.id === computeCheckpoint.id)
    const aggregateDependsOnCompute = aggregateCheckpoint.dependsOn.includes(computeCheckpoint.id)
    if (aggregateIndex < computeIndex && !aggregateDependsOnCompute) {
      issues.push(`蓝图将聚合 checkpoint ${aggregateCheckpoint.id} 排在计算列 checkpoint ${computeCheckpoint.id} 之前`)
    }
  }

  return issues
}

function collectCoreFkCoverageIssues(dataset: ReturnType<typeof getDataSetState>['data']): string[] {
  if (!dataset) return []

  const relations: Array<{ childTable: string; childField: string }> =
    (dataset.tableRelations as Array<{ childTable: string; childField: string }>) ?? []
  const missingCoreFks: string[] = []

  for (const [tableName, table] of Object.entries(dataset.tables)) {
    for (const column of table.columns) {
      const columnName = String(asDict(column)['name'] ?? '')
      if (!columnName || !/Id$/u.test(columnName) || columnName === 'id') continue
      if (/^(parent|manager|supervisor)Id$/u.test(columnName)) continue
      if (/^(next|specific|current|previous)/u.test(columnName)) continue
      const hasRelation = relations.some((relation) => relation.childTable === tableName && relation.childField === columnName)
      if (!hasRelation) missingCoreFks.push(`${tableName}.${columnName}`)
    }
  }

  return missingCoreFks
}

function collectTableRowConsistencyIssues(tableName: string, table: { columns: unknown[] } | undefined, views: Record<string, Record<string, unknown>> | undefined): string[] {
  if (!table) return [`${tableName} 不存在`]

  const columnMap = new Map(
    table.columns.map((column) => {
      const dict = asDict(column)
      return [String(dict['name']), dict] as const
    }),
  )
  const primaryKeys = [...columnMap.values()]
    .filter((column) => column['isPrimaryKey'] === true)
    .map((column) => String(column['name']))
  const rows = (views?.['default']?.['rows'] as unknown[] | undefined) ?? []
  const issues: string[] = []

  if (rows.length === 0) {
    issues.push(`${tableName}.default 缺少种子数据`)
    return issues
  }

  rows.forEach((rowValue, rowIndex) => {
    const row = asDict(rowValue)
    for (const key of Object.keys(row)) {
      if (key === '_pk') continue
      if (!columnMap.has(key)) {
        issues.push(`${tableName}.rows[${rowIndex}].${key} 未声明为列`)
      }
    }
    for (const primaryKey of primaryKeys) {
      if (!(primaryKey in row) || row[primaryKey] === null || row[primaryKey] === undefined || row[primaryKey] === '') {
        issues.push(`${tableName}.rows[${rowIndex}] 缺少主键列 ${primaryKey}`)
      }
    }
    for (const [columnName, column] of columnMap.entries()) {
      if (!(columnName in row)) {
        if (column['computeExpression'] == null) {
          issues.push(`${tableName}.rows[${rowIndex}] 缺少列 ${columnName}`)
        }
        continue
      }
      if (!isCompatibleValue(column['type'], row[columnName])) {
        issues.push(
          `${tableName}.rows[${rowIndex}].${columnName} 类型不匹配: 值=${JSON.stringify(row[columnName])}, 列类型=${String(column['type'])}`,
        )
      }
    }
  })

  return issues
}

function collectOptionViewConfigIssues(dataset: ReturnType<typeof getDataSetState>['data'] | null): string[] {
  if (!dataset) return []

  const issues: string[] = []
  for (const [tableName, table] of Object.entries(dataset.tables)) {
    const optionsView = getViews(table)?.['options']
    if (!optionsView) continue

    if (!optionsView['valueField']) issues.push(`${tableName}.options 缺少 valueField`)
    if (!optionsView['labelField']) issues.push(`${tableName}.options 缺少 labelField`)

    const hasParentId = table.columns.some((column) => String(asDict(column)['name'] ?? '') === 'parentId')
    if (hasParentId && optionsView['treeConfig'] == null) {
      issues.push(`${tableName}.options 缺少 treeConfig`)
    }
  }

  return issues
}

function buildOptionsRepairTemplate(tableName: string, table: { columns: unknown[] } | undefined, issue: string, requestId: string): string | null {
  if (!table) return null

  const columnNames = table.columns.map((column) => String(asDict(column)['name'] ?? ''))
  const labelField = columnNames.includes('name') ? 'name' : (columnNames.find((name) => name && name !== 'id') ?? 'id')
  const valueField = columnNames.includes('code') ? 'code' : (columnNames.includes('id') ? 'id' : labelField)

  if (issue.includes('treeConfig')) {
    return formatSapProtocolBlock('request', 'dataview.setTreeConfig', `${requestId}-fix-tree`, {
      tableName,
      viewId: 'options',
      treeConfig: {
        idField: 'id',
        parentIdField: 'parentId',
        textField: labelField,
      },
    })
  }

  return formatSapProtocolBlock('request', 'dataview.configure', `${requestId}-fix-options`, {
    tableName,
    viewId: 'options',
    config: {
      valueField,
      labelField,
    },
  })
}

// ═══════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════

async function main() {
  const t0 = Date.now()

  // 1. 验证 API Key
  if (!DEEPSEEK_API_KEY) {
    throw new Error('OPENAI_API_KEY 环境变量未配置。请设置 DeepSeek API Key。')
  }
  console.log(`🔑 API: ${DEEPSEEK_BASE_URL} / ${DEEPSEEK_MODEL}`)

  // 2. 初始化 Stills 引擎
  console.log('\n🔧 初始化 Stills 引擎...')
  registerAllStills()
  const session: IStillSession = createSession()
  console.log('✅ 32 个 Stills 已注册，会话已创建\n')

  // 3. 对话容器（多轮累积）
  const conversation: Array<{ role: string; content: string }> = [
    { role: 'user', content: USER_PROMPT },
  ]
  const turns: DialogueTurn[] = []
  let round = 0
  let finalSummary = ''
  let consecutiveErrors = 0
  let lastErrorSignature = ''
  let lastSapSignature = ''
  let repeatedSapSignatureCount = 0
  let exportCompleted = false
  const runtimeAbort: RuntimeAbortState = { aborted: false, reason: '' }

  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  SAP 协议 + Stills 引擎 — 直连 DeepSeek (${DEEPSEEK_MODEL})`)
  console.log('═══════════════════════════════════════════════════════════\n')
  console.log(`📋 用户需求: ${USER_PROMPT.slice(0, 80)}...\n`)

  // 4. 滑动窗口裁剪 — 始终保留首条用户消息 + 最近 SLIDING_WINDOW-1 条
  function getWindowedConversation(): Array<{ role: string; content: string }> {
    if (conversation.length <= SLIDING_WINDOW) return conversation
    const first = conversation[0]!
    // 确保从 assistant 消息开始（assistant + user 成对）
    let startIdx = conversation.length - (SLIDING_WINDOW - 1)
    if (conversation[startIdx]?.role !== 'assistant') startIdx++
    const recent = conversation.slice(startIdx)
    return [first, ...recent]
  }

  // 5. 工具循环
  while (round < MAX_ROUNDS) {
    round++
    const roundStart = Date.now()
    console.log(`── 第 ${round} 轮 ──────────────────────────────────────────`)

    // Step A: 调用 LLM（滑动窗口）
    const windowed = getWindowedConversation()
    const allMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: STILLS_PROTOCOL_SYSTEM_PROMPT },
      ...windowed,
    ]
    const trimmed = conversation.length - windowed.length
    console.log(`  📡 调用 LLM... (${allMessages.length} 条消息${trimmed > 0 ? `, 裁剪 ${trimmed} 条` : ''})`)
    const { text: aiReply, reasoning } = await streamChat(allMessages)
    const aiElapsed = Date.now() - roundStart

    if (reasoning) {
      console.log(`  💭 推理: ${reasoning.slice(0, 120)}...`)
    }

    // Step B: 检测 SAP 协议块
    const blocks = extractSapBlocks(aiReply)

    if (blocks.length === 0) {
      // 无协议块 → 提醒 AI 使用协议（export 成功已在上方直接 break）
      console.log(`  ⚠️  AI 输出了自然语言，提醒使用协议`)
      conversation.push({ role: 'assistant', content: aiReply })
      conversation.push({
        role: 'user',
        content: `[系统协议提醒]\n你必须只输出一个 SAP 协议块（@@describe 或 @@request），不要输出自然语言。可直接按以下模板重试：\n${formatSapProtocolBlock('describe', 'session.describe', `retry-${round}`, {})}\n或\n${formatSapProtocolBlock('describe', 'stills.capabilities', `retry-${round}-capabilities`, {})}`,
      })
      turns.push({
        round,
        timestamp: new Date().toISOString(),
        phase: 'ai-response',
        aiText: aiReply,
        aiReasoning: reasoning || undefined,
        elapsed: aiElapsed,
      })
      continue
    }

    if (blocks.length > 1) {
      // 多个协议块 → 协议错误，要求重试
      console.log(`  ⚠️  检测到 ${blocks.length} 个协议块，要求 AI 重试`)
      conversation.push({ role: 'assistant', content: aiReply })
      conversation.push({
        role: 'user',
        content: `[系统协议错误]\n一次只允许输出 1 个 SAP 协议块。请只输出一个块，并可直接按以下模板重试：\n${formatSapProtocolBlock('describe', 'session.describe', `retry-${round}`, {})}`,
      })
      turns.push({
        round,
        timestamp: new Date().toISOString(),
        phase: 'ai-response',
        aiText: aiReply,
        aiReasoning: reasoning || undefined,
        elapsed: aiElapsed,
      })
      continue
    }

    // 单个协议块 → 执行
    const block = blocks[0]!
    const params = parseBlockBody(block.body)
    console.log(`  🔧 @@${block.type}:${block.action}#${block.id}`)
    console.log(`     参数: ${JSON.stringify(params).slice(0, 150)}`)

    // Step C: 本地 Stills 引擎执行
    const execStart = Date.now()
    const result = executeStill(block.action, params, session, block.id)
    const execElapsed = Date.now() - execStart
    const currentStill = getStill(block.action)
    const currentSapSignature = `${block.action}:${JSON.stringify(params)}:${result.ok ? 'ok' : result.code}`
    if (currentSapSignature === lastSapSignature) {
      repeatedSapSignatureCount++
    } else {
      lastSapSignature = currentSapSignature
      repeatedSapSignatureCount = 1
    }

    // 构造 @@result / @@error 文本
    let resultText: string
    let errorCorrection: SapImmediateCorrection | undefined
    if (result.ok) {
      resultText = `@@result:${block.action}#${block.id}\n${JSON.stringify(result.data)}\n@@end`
      console.log(`  ✅ 成功 (${execElapsed}ms): ${result.summary}`)
      consecutiveErrors = 0
      lastErrorSignature = ''

      // dataset.export 成功 → 立即退出循环，任务完成
      if (block.action === 'dataset.export') {
        exportCompleted = true
        console.log('  📦 dataset.export 已完成，继续等待模型显式完成蓝图收尾')
      }
    } else {
      const candidateActions = result.code === 'UNKNOWN_ACTION' ? findCandidateActions(block.action) : []
      let correction = buildCorrectionFromStill(block.action, currentStill, block.id, candidateActions, result.fix)
      if (block.action === 'blueprint.revise' && /请先 blueprint\.describe/u.test(result.fix)) {
        const describeStill = getStill('blueprint.describe')
        correction = {
          ...correction,
          suggestedAction: 'blueprint.describe',
          suggestedType: 'describe',
          guard: describeStill?.guardDescription ?? null,
          paramsSchema: describeStill?.paramsSchema ?? {},
          example: describeStill?.example ?? {},
          usageRules: describeStill?.usageRules ?? correction.usageRules,
          failureModes: describeStill?.failureModes ?? correction.failureModes,
          suggestedProtocolBlock: formatSapProtocolBlock('describe', 'blueprint.describe', `${block.id}-retry-describe`, {}),
        }
      }
      errorCorrection = correction
      resultText = `@@error:${block.action}#${block.id}\n${JSON.stringify({
        code: result.code,
        msg: result.msg,
        fix: result.fix,
        correction,
      }, null, 2)}\n@@end`
      console.log(`  ❌ 失败: [${result.code}] ${result.msg}`)
      console.log(`     修复: ${result.fix}`)
      if (correction.suggestedProtocolBlock) {
        console.log(`     模板: ${correction.suggestedProtocolBlock}`)
      }

      const currentErrorSignature = `${block.action}:${result.code}`
      if (lastErrorSignature === currentErrorSignature) {
        consecutiveErrors++
      } else {
        consecutiveErrors = 1
        lastErrorSignature = currentErrorSignature
      }

      if (consecutiveErrors >= 3) {
        console.log(`  🛑 连续 ${consecutiveErrors} 次同一错误，终止循环`)
        break
      }
    }

    // 记录对话轮次
    turns.push({
      round,
      timestamp: new Date().toISOString(),
      phase: 'stills-execute',
      aiText: stripSapBlocks(aiReply) || undefined,
      aiReasoning: reasoning || undefined,
      sapBlock: {
        type: block.type,
        action: block.action,
        id: block.id,
        params,
      },
      stillsResult: result.ok
        ? { ok: true, data: result.data, summary: result.summary }
        : { ok: false, code: result.code, msg: result.msg, fix: result.fix, correction: errorCorrection },
      elapsed: Date.now() - roundStart,
    })

    let runtimeAbortReason = ''
    if (repeatedSapSignatureCount >= 3) {
      runtimeAbortReason = `检测到相同协议动作连续重复 ${repeatedSapSignatureCount} 次: ${block.action}`
    }
    if (!runtimeAbortReason && result.ok && block.action === 'dataset.validate') {
      const validateData = asDict(result.data)
      if (validateData['valid'] === false) {
        runtimeAbortReason = `dataset.validate 未通过，说明当前 stills 约束未能把错误在更早阶段拦住`
      }
    }
    if (!runtimeAbortReason && result.ok && block.action === 'schema.lock') {
      const missingCoreFks = collectCoreFkCoverageIssues(getDataSetState(session).data)
      if (missingCoreFks.length > 0) {
        runtimeAbortReason = `schema.lock 成功后仍缺少核心关系: ${missingCoreFks.join(', ')}`
      }
    }
    if (!runtimeAbortReason && result.ok && block.action === 'datatable.addRows') {
      const currentTableName = String(asDict(params)['tableName'] ?? '')
      const currentDataset = getDataSetState(session).data
      const currentTable = currentTableName ? currentDataset?.tables[currentTableName] : undefined
      const currentViews = currentTable ? getViews(currentTable) : undefined
      const rowIssues = currentTableName && currentViews?.['options']
        ? collectTableRowConsistencyIssues(currentTableName, currentTable, currentViews)
        : []
      if (rowIssues.length > 0) {
        runtimeAbortReason = `datatable.addRows 成功后仍写入了不一致种子数据: ${rowIssues.join('；')}`
      }
    }
    if (!runtimeAbortReason && result.ok && (block.action === 'dataview.configure' || block.action === 'dataview.setTreeConfig' || block.action === 'dataview.setAggregates')) {
      const rawParams = asDict(params)
      if (typeof rawParams['viewName'] === 'string' && rawParams['viewId'] === undefined) {
        runtimeAbortReason = `${block.action} 使用了非法参数 viewName，说明具体 still 对协议误用拦截不足`
      }
    }

    if (runtimeAbortReason) {
      runtimeAbort.aborted = true
      runtimeAbort.reason = runtimeAbortReason
      finalSummary = `运行中止：${runtimeAbortReason}`
      console.log(`  🛑 运行中监控触发终止: ${runtimeAbortReason}`)
      break
    }

    // Step D: 注入结果回对话
    const followUpInstructions: string[] = []
    if (!result.ok) {
      const candidateActions = result.code === 'UNKNOWN_ACTION' ? findCandidateActions(block.action) : []
      const correction = buildCorrectionFromStill(block.action, currentStill, block.id, candidateActions, result.fix)
      const candidateText = correction.candidateActions && correction.candidateActions.length > 0
        ? `\n候选动作: ${correction.candidateActions.join(', ')}`
        : ''
      const ruleText = correction.usageRules.length > 0
        ? `\n关键规则:\n- ${correction.usageRules.join('\n- ')}`
        : ''
      const protocolText = correction.suggestedProtocolBlock
        ? `\n正确协议块示例:\n${correction.suggestedProtocolBlock}`
        : ''
      followUpInstructions.push(`[系统即时纠错]\n上一条动作 ${block.action} 执行失败（${result.code}）。下一轮必须按下列纠正信息直接改正，不要重复原错误指令。\n建议动作: ${correction.suggestedAction ?? '先执行 stills.capabilities 重新选动作'}${correction.guard ? `\n前置条件: ${correction.guard}` : ''}${candidateText}${protocolText}${ruleText}`)
    }
    if (result.ok && block.action === 'blueprint.create') {
      followUpInstructions.push('[系统编排要求]\n现在进入蓝图优化轮。下一轮先执行 blueprint.describe，审阅 checkpoints 的 dependsOn / relatedCheckpointIds / executionMode / subagentGoal；如缺失或不合理，先用 blueprint.revise 修正，然后再开始 dataset.init、datatable.create、relation.add 等写动作。蓝图优化只允许重排、拆分、补依赖，不允许删除原始业务动作覆盖范围。若拆分 checkpoint，拆分后的动作并集必须完整保留 default 视图配置、options 的 valueField/labelField、treeConfig、computeExpression、aggregates、datatable.addRows、dataset.validate、dataset.export。凡是需求写了 options 视图，就必须保留 dataview.create(options) + dataview.configure(options)，禁止把这些配置挪到 default 视图。')
    }
    if (result.ok && (block.action === 'blueprint.create' || block.action === 'blueprint.revise')) {
      const blueprintIssues = collectBlueprintCoverageIssues(session.blueprint)
      if (blueprintIssues.length > 0) {
        followUpInstructions.push(`[系统蓝图校验失败]\n当前蓝图仍有关键遗漏：\n- ${blueprintIssues.join('\n- ')}\n下一轮必须先执行 blueprint.revise 修复这些问题；在蓝图修复前，禁止执行 dataset.init、datatable.create、relation.add、schema.lock 等写动作。`)
      }
    }
    if (result.ok && block.action === 'schema.lock') {
      const missingCoreFks = collectCoreFkCoverageIssues(getDataSetState(session).data)
      if (missingCoreFks.length > 0) {
        followUpInstructions.push(`[系统关系校验失败]\n当前 schema.lock 后仍缺少核心关系：\n- ${missingCoreFks.join('\n- ')}\n下一轮优先执行 relation.add 补齐这些关系；如蓝图未覆盖，请先 blueprint.revise 再补关系。`)
      }
    }
    if (result.ok && block.action === 'datatable.addRows') {
      const currentTableName = String(asDict(params)['tableName'] ?? '')
      const currentDataset = getDataSetState(session).data
      const currentTable = currentTableName ? currentDataset?.tables[currentTableName] : undefined
      const currentViews = currentTable ? getViews(currentTable) : undefined
      const rowIssues = currentTableName && currentViews?.['options']
        ? collectTableRowConsistencyIssues(currentTableName, currentTable, currentViews)
        : []
      if (rowIssues.length > 0) {
        followUpInstructions.push(`[系统种子数据一致性校验失败]\n当前表 ${currentTableName} 的种子数据与列定义不一致：\n- ${rowIssues.join('\n- ')}\n下一轮优先修正字段名、主键列和值类型；必要时先 schema.unlock，再用 datatable.updateColumn / datatable.addColumns / datatable.removeColumn 调整结构后继续。`)
      }

      const remainingSeedTables = Object.entries(currentDataset?.tables ?? {})
        .filter(([_, table]) => getViews(table)?.['options'] != null)
        .filter(([_, table]) => ((getViews(table)?.['default']?.['rows'] as unknown[] | undefined) ?? []).length === 0)
        .map(([tableName]) => tableName)

      if (remainingSeedTables.length > 0) {
        const nextTableName = remainingSeedTables[0]
        const nextTable = nextTableName ? currentDataset?.tables[nextTableName] : undefined
        const nextSeedTemplate = nextTableName ? buildSeedRowsTemplate(nextTableName, nextTable, block.id) : null
        followUpInstructions.push(`[系统种子数据未完成]\n当前仍缺少内联数据的 options 源表: ${remainingSeedTables.join(', ')}。下一轮不要提前推进 blueprint，先继续补齐下一张表的数据。${nextSeedTemplate ? `\n建议先执行：\n${nextSeedTemplate}` : ''}`)
      }
    }
    if (result.ok && block.action === 'dependency.add') {
      const currentDataset = getDataSetState(session).data
      const currentDependencies = currentDataset?.viewDependencies ?? []
      const latestDependency = currentDependencies.at(-1)
      const parentTable = String(latestDependency?.parentTable ?? '')
      const childTable = String(latestDependency?.childTable ?? '')

      if (parentTable && childTable) {
        followUpInstructions.push(`[系统 dependency 校验失败]\n当前页面没有级联过滤需求，options 数据源不应额外配置 dependency。下一轮必须先移除刚添加的依赖，例如：\n@@request:dependency.remove#${block.id}-remove-dependency\n{\n  "parentTable": "${parentTable}",\n  "childTable": "${childTable}"\n}\n@@end`)
      }
    }
    if (result.ok && (block.action === 'datatable.create' || block.action === 'datatable.addColumns' || block.action === 'datatable.updateColumn')) {
      const dataState = getDataSetState(session)
      const leaveApplication = dataState.data?.tables['LeaveApplication']
      const leaveDaysColumn = leaveApplication?.columns
        .map((column) => asDict(column))
        .find((column) => String(column['name'] ?? '') === 'leaveDays')

      if (!leaveDaysColumn || leaveDaysColumn['computeExpression'] == null) {
        const nextAction = dataState.locked ? 'schema.unlock' : (leaveDaysColumn ? 'datatable.updateColumn' : 'datatable.addColumns')
        const nextBlock = dataState.locked
          ? `@@request:schema.unlock#${block.id}-fix-leavedays\n{}\n@@end`
          : leaveDaysColumn
            ? `@@request:datatable.updateColumn#${block.id}-fix-leavedays\n{\n  "tableName": "LeaveApplication",\n  "columnName": "leaveDays",\n  "updates": {\n    "type": "number",\n    "label": "请假天数",\n    "computeExpression": "Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000) + 1"\n  }\n}\n@@end`
            : `@@request:datatable.addColumns#${block.id}-fix-leavedays\n{\n  "tableName": "LeaveApplication",\n  "columns": [\n    {\n      "name": "leaveDays",\n      "type": "number",\n      "label": "请假天数",\n      "computeExpression": "Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000) + 1"\n    }\n  ]\n}\n@@end`

        followUpInstructions.push(`[系统计算列校验失败]\nLeaveApplication.leaveDays ${leaveDaysColumn ? '缺少 computeExpression，当前仍是普通列' : '尚未创建为计算列'}。下一轮必须先执行 ${nextAction} 修正该字段，例如：\n${nextBlock}`)
      }
    }
    if (result.ok && (block.action === 'dataview.create' || block.action === 'dataview.configure' || block.action === 'dataview.setTreeConfig')) {
      const currentDataset = getDataSetState(session).data
      const optionViewIssues = collectOptionViewConfigIssues(currentDataset)

      if (optionViewIssues.length > 0) {
        const firstIssue = optionViewIssues[0]
        const tableName = firstIssue.split('.options')[0] ?? ''
        const table = tableName ? currentDataset?.tables[tableName] : undefined
        const repairTemplate = tableName ? buildOptionsRepairTemplate(tableName, table, firstIssue, block.id) : null
        followUpInstructions.push(`[系统 options 视图校验失败]\n当前仍有未完成的 options 视图配置：\n- ${optionViewIssues.join('\n- ')}\n下一轮必须先补齐这些配置，再继续后续步骤。${repairTemplate ? `\n建议先执行：\n${repairTemplate}` : ''}`)
      }
    }
    if (result.ok && block.action === 'dataview.setAggregates') {
      const currentDataset = getDataSetState(session).data
      const mainTable = currentDataset?.tables['LeaveApplication']
      const computedNumericFields = (mainTable?.columns ?? [])
        .map((column) => asDict(column))
        .filter((column) => {
          const columnType = column['type']
          return column['computeExpression'] != null
            && (columnType === 'number' || columnType === 'decimal' || columnType === 'int' || columnType === 'integer')
        })
        .map((column) => String(column['name']))
      const mainAggregates = normalizeAggregateEntries(getViews(mainTable)?.['default']?.['aggregates'])
      const aggregatedComputedFields = mainAggregates
        .filter((aggregate) => aggregate.aggregate === 'sum')
        .map((aggregate) => aggregate.field)
        .filter((field) => computedNumericFields.includes(field))

      if (computedNumericFields.length > 0 && aggregatedComputedFields.length === 0) {
        followUpInstructions.push(`[系统聚合校验失败]\n主表计算列 ${computedNumericFields.join(', ')} 尚未被 default 视图配置 sum 聚合。下一轮必须先改正聚合配置，例如：\n@@request:dataview.setAggregates#${block.id}-fix-aggregates\n{\n  "tableName": "LeaveApplication",\n  "viewId": "default",\n  "aggregates": [\n    { "field": "leaveDays", "type": "sum", "label": "总请假天数" }\n  ]\n}\n@@end`)
      }
    }
    if (result.ok && block.action === 'dataset.export' && hasPendingBlueprintWork(session.blueprint)) {
      followUpInstructions.push('[系统编排要求]\ndataset.export 已成功。若蓝图仍有未完成的 plan item / checkpoint，下一轮只允许使用 blueprint.item.advance 或 blueprint.advance 完成收尾；禁止再次修改 DataSet 结构、视图、API、种子数据。')
    }
    if (result.ok && session.blueprint && !hasPendingBlueprintWork(session.blueprint)) {
      const missingTerminalActions = [
        !hasSuccessfulStill(turns, 'dataset.validate') ? 'dataset.validate' : null,
        !hasSuccessfulStill(turns, 'dataset.export') ? 'dataset.export' : null,
      ].filter((action): action is string => action !== null)

      if (missingTerminalActions.length > 0) {
        followUpInstructions.push(`[系统终态校验失败]\n蓝图已全部完成，但以下必需动作尚未成功执行：${missingTerminalActions.join(', ')}。下一轮禁止继续 session.describe 或自然语言总结；请先直接执行：\n@@request:${missingTerminalActions[0]}#${block.id}-terminal-fix\n{}\n@@end\n完成后再继续剩余终态动作。`)
      }
    }
    const followUpInstruction = followUpInstructions.length > 0
      ? `\n\n${followUpInstructions.join('\n\n')}`
      : ''
    if (followUpInstruction) {
      console.log('  🧭 已注入蓝图优化要求')
    }
    conversation.push({ role: 'assistant', content: aiReply })
    conversation.push({
      role: 'user',
      content: `[系统工具执行结果]\n${resultText}${followUpInstruction}`,
    })

    if (exportCompleted && !hasPendingBlueprintWork(session.blueprint)) {
      console.log('  🏁 DataSet 已导出且蓝图已由模型显式完成，退出循环')
      finalSummary = '（任务完成，已导出 DataSet 且蓝图完成）'
      break
    }
  }

  // 如果内循环结束时还没有 finalSummary（达到 MAX_ROUNDS 或错误退出），请求一次总结
  if (!runtimeAbort.aborted && !finalSummary && round >= MAX_ROUNDS) {
    console.log('\n⏱️  达到最大轮次，请求 AI 总结...')
    conversation.push({
      role: 'user',
      content: '你已完成数据模型设计工作。请总结本次设计的成果：包含哪些表、关系、视图，以及整体结构。',
    })
    const allMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: STILLS_SUMMARY_SYSTEM_PROMPT },
      ...conversation,
    ]
    const { text: summary } = await streamChat(allMessages)
    finalSummary = summary
    turns.push({
      round: round + 1,
      timestamp: new Date().toISOString(),
      phase: 'summary-request',
      aiText: summary,
    })
  }

  // ═══════════════════════════════════════════════════════════
  // 4b. AI 自检：将导出结果回传 LLM，让其审查是否有遗漏
  // ═══════════════════════════════════════════════════════════

  const selfCheckState = getDataSetState(session)
  if (!runtimeAbort.aborted && selfCheckState.data && finalSummary) {
    console.log('\n🔍 AI 自检：将导出结果回传 LLM 审查...')

    // 构造精简的导出摘要（避免 token 过多）
    const exportedDs = selfCheckState.data
    const tablesSummary = Object.entries(exportedDs.tables).map(([name, t]) => {
      const defaultRows = (getViews(t)?.['default']?.['rows'] as unknown[] | undefined) ?? []
      const tableRowSummary = defaultRows.length > 0 ? `${defaultRows.length} 行种子数据` : '0 行种子数据'
      const cols = t.columns.map((c) => {
        const column = asDict(c)
        let desc = `${column['name']}(${column['type']}`
        if (column['isPrimaryKey']) desc += ',PK'
        if (column['computeExpression']) desc += `,expr=${(column['computeExpression'] as string).slice(0, 40)}`
        desc += ')'
        return desc
      }).join(', ')
      const views = Object.entries(getViews(t) ?? {}).map(([vid, v]) => {
        const flags: string[] = []
        if (v['autoCurrentFirst']) flags.push('autoCurrentFirst=true')
        if (v['autoLoad']) flags.push('autoLoad=true')
        if (v['valueField']) flags.push(`valueField=${v['valueField']}`)
        if (v['labelField']) flags.push(`labelField=${v['labelField']}`)
        if (v['treeConfig']) flags.push('treeConfig')
        const aggregateSummary = formatAggregateSummary(v['aggregates'])
        if (aggregateSummary) flags.push(`aggregates=${aggregateSummary}`)
        const sortSummary = formatSortSummary(v)
        if (sortSummary) flags.push(`sort=${sortSummary}`)
        const rowCount = Array.isArray(v['rows']) ? (v['rows'] as unknown[]).length : 0
        if (rowCount > 0) flags.push(`${rowCount}行内联`)
        return `${vid}(${flags.join(', ')})`
      }).join('; ')
      const api = t.api ? Object.keys(t.api).join(',') : '无'
      return `  ${name}: 数据=[${tableRowSummary}] 列=[${cols}] 视图=[${views}] API=[${api}]`
    }).join('\n')

    const relsSummary = (exportedDs.tableRelations ?? []).map((r) => {
      const relation = asDict(r)
      return `  ${relation['parentTable']}→${relation['childTable']} (${relation['parentField']}→${relation['childField']})`
    }).join('\n')

    const depsSummary = (exportedDs.viewDependencies ?? []).map((dependencyValue) => {
      const dependency = asDict(dependencyValue)
      return `  ${dependency['parentTable']}→${dependency['childTable']} (${dependency['dependencyType'] ?? 'unknown'})`
    }).join('\n')

    const selfCheckPrompt = `以下是你刚才导出的 DataSet 的完整结构摘要，请严格按显式需求审查，不要脑补额外设计。

═══ 导出结果摘要 ═══
DataSet: ${exportedDs.dataSetName}
表数: ${Object.keys(exportedDs.tables).length}

${tablesSummary}

关系:
${relsSummary || '  无'}

依赖:
${depsSummary || '  无'}

═══ 原始需求回顾 ═══
${USER_PROMPT}

═══ 主表字段映射（显式事实）═══
对本次导出结果，以下字段映射已经成立，审查时必须直接按此理解，不得另行脑补别名字段：
1. “申请编号”对应主表列 id，其 label 为“申请编号”；这已经满足业务上的申请编号字段，不需要额外的 applicationNo / applyNumber / applicationNumber 列。
2. “申请人”对应主表列 applicantId。
3. “假别”对应主表列 leaveTypeId。
4. “状态”对应主表列 status；如果列摘要中已出现 status(...)，就必须判定该字段已存在。

═══ 选项映射事实（显式事实）═══
对本次导出结果，以下“主表字段 ← 源表 options 视图”的映射已经成立，审查时必须直接按此理解：
1. applicantId ← Employee.options(valueField=id, labelField=name)。如果关系列表中已出现 Employee→LeaveApplication (id→applicantId)，且 Employee 的 options 视图已配置 valueField=id、labelField=name，则“申请人”字段的选项映射已经满足，不得再声称缺少“申请人映射关系”。
2. leaveTypeId ← LeaveType.options(valueField=id, labelField=name)。如果关系列表中已出现 LeaveType→LeaveApplication (id→leaveTypeId)，且 LeaveType 的 options 视图已配置 valueField=id、labelField=name，则“假别”字段的选项映射已经满足。
3. departmentId ← Department.options(valueField=id, labelField=name, treeConfig)。如果关系列表中已出现 Department→Employee (id→departmentId)，且 Department 的 options 视图已配置 valueField=id、labelField=name、treeConfig，则“部门”字段的树形选项映射已经满足。

═══ 审查边界（严格执行）═══
1. 只能依据“原始需求回顾”中的显式要求和“导出结果摘要”中的显式事实判断，不得补充行业习惯、默认约定或你主观认为“通常还需要”的表。
2. 主表中的“状态”字段只要求该字段存在；如果原始需求没有明确要求 status/状态字典表、options 视图或 relation，就不得判定缺少 LeaveStatus、Statuses 一类额外表。
3. 如果“关系”列表中已经出现某个 parentTable→childTable (parentField→childField)，就视为该 relation 已满足；不得再声称该外键“缺少 relation 声明”。
4. 只有 LeaveType、Employee、Department 被明确要求作为选项数据源；不得把其他字段擅自提升为必须的字典表或 options 视图。
5. 只有真正违反显式需求的项才算失败；可选优化建议不要判定为“遗漏”。
6. 同一张表的多个视图共享同一份表数据；如果摘要里已经写明某表存在“X 行种子数据”，就不得因为 options 视图没有重复标注 rows 而判定“缺少初始数据”。
7. 除非原始需求明确要求排序，否则不得把“缺少排序配置”判定为失败；autoCurrentFirst 的显式存在本身已经满足该项需求。
8. 主表 LeaveApplication 不需要单独的 options 视图；leaveTypeId / applicantId 使用的是 LeaveType / Employee / Department 这些源表的 options 视图，而不是主表自身的 options 视图。
9. 如果摘要中的某个 default 视图已经出现 sort=... 或明确列出 autoCurrentFirst=true，则不得再声称该视图“缺少排序”“未开启 autoCurrentFirst”或“无法确定首行”。
10. 如果某个视图摘要中已经出现 aggregates=leaveDays:sum 或其他 aggregates=字段:sum 形式，就必须判定该字段的 sum 聚合已经配置完成；不得再声称“缺少聚合配置”。
11. 如果列摘要中已经出现 leaveDays(number,expr=...)，且视图摘要中同时出现 aggregates=leaveDays:sum，就必须判定“请假天数为 JS 计算列且已按天数聚合”这两项都已满足。

═══ 审查要求 ═══
请逐项核对：
1. 每个需求点是否都在导出中体现？
2. 外键列是否都有对应的 relation？
3. 树形表的 options 视图是否有 treeConfig？
4. 主表是否配置了 autoCurrentFirst？
5. 计算列表达式是否为纯 JS（非 SQL），并且像 leaveDays 这类显式要求汇总的字段是否已经在摘要里出现 aggregates=...:sum？
6. 选项表是否有内联数据？
7. 是否存在多余的 viewDependency？本页的 options 数据源不应额外配置 dependency。

如果一切完整无误，请回复"✅ 审查通过，无遗漏"。
如果有遗漏，请逐条列出需要补充的内容（不需要执行协议操作，只列出遗漏项即可）。`

    conversation.push({ role: 'assistant', content: '已完成 DataSet 导出。' })
    conversation.push({ role: 'user', content: selfCheckPrompt })

    const selfCheckMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: STILLS_REVIEW_SYSTEM_PROMPT },
      ...getWindowedConversation(),
    ]

    const { text: selfCheckReply, reasoning: selfCheckReasoning } = await streamChat(selfCheckMessages)

    // 分析自检结果
    const isAllGood = /审查通过|无遗漏|一切完整|全部覆盖|没有遗漏/.test(selfCheckReply)
    const icon = isAllGood ? '✅' : '⚠️'
    console.log(`\n${icon} AI 自检结果:`)
    // 输出自检内容（限制长度避免刷屏）
    const displayText = selfCheckReply.length > 500 ? selfCheckReply.slice(0, 500) + '...' : selfCheckReply
    for (const line of displayText.split('\n')) {
      console.log(`  ${line}`)
    }

    turns.push({
      round: round + 1,
      timestamp: new Date().toISOString(),
      phase: 'self-check',
      aiText: selfCheckReply,
      aiReasoning: selfCheckReasoning || undefined,
    })
  }

  const totalElapsed = Date.now() - t0

  // ═══════════════════════════════════════════════════════════
  // 5. 输出结果
  // ═══════════════════════════════════════════════════════════

  const dataDir = path.join(process.cwd(), 'data')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  // 5a. 完整对话记录
  const dialogue: FullDialogue = {
    startedAt: new Date(Date.now() - totalElapsed).toISOString(),
    userPrompt: USER_PROMPT,
    systemPrompt: '（Stills 运行时系统提示词，见 STILLS_RUNTIME_PROMPT.md）',
    rounds: round,
    turns,
    finalSummary,
    totalElapsed,
  }
  const dialoguePath = path.join(dataDir, 'sap-stills-dialogue.json')
  fs.writeFileSync(dialoguePath, JSON.stringify(dialogue, null, 2), 'utf-8')
  console.log(`\n📄 对话记录 → ${dialoguePath}`)

  // 5b. 最终 DataSet 元数据
  const datasetState = getDataSetState(session)
  if (datasetState.data) {
    const metadataPath = path.join(dataDir, 'sap-stills-metadata.json')
    fs.writeFileSync(metadataPath, JSON.stringify(datasetState.data, null, 2), 'utf-8')
    console.log(`📄 DataSet 元数据 → ${metadataPath}`)

    // 统计信息
    const tables = Object.keys(datasetState.data.tables)
    const totalColumns = tables.reduce(
      (sum, t) => sum + (datasetState.data!.tables[t]?.columns.length ?? 0),
      0,
    )
    const relations = datasetState.data.tableRelations?.length ?? 0

    console.log(`\n═══ 设计成果 ═══`)
    console.log(`  表: ${tables.length} (${tables.join(', ')})`)
    console.log(`  列: ${totalColumns}`)
    console.log(`  关系: ${relations}`)
    console.log(`  Schema 锁定: ${datasetState.locked}`)
    console.log(`  设计阶段: ${datasetState.phase}`)
  } else {
    console.log('\n⚠️  会话中未创建 DataSet（AI 可能未完成建模流程）')
  }

  // 5c. 会话 patchLog
  console.log(`\n═══ 变更日志 (${session.patchLog.length} 条) ═══`)
  for (const entry of session.patchLog) {
    console.log(`  [${entry.action}] ${entry.summary}`)
  }

  // 5d. 蓝图状态
  if (session.blueprint) {
    const bp = session.blueprint
    const done = bp.checkpoints.filter(c => c.status === 'done').length
    const total = bp.checkpoints.length
    console.log(`\n═══ 蓝图 ═══`)
    console.log(`  目标: ${bp.userGoal}`)
    console.log(`  进度: ${done}/${total} 检查点`)
    for (const cp of bp.checkpoints) {
      const icon = cp.status === 'done' ? '✅' : '⬜'
      console.log(`  ${icon} ${cp.id}: ${cp.title}`)
      if (cp.dependsOn && cp.dependsOn.length > 0) {
        console.log(`     依赖: ${cp.dependsOn.join(', ')}`)
      }
      if (cp.relatedCheckpointIds && cp.relatedCheckpointIds.length > 0) {
        console.log(`     关联: ${cp.relatedCheckpointIds.join(', ')}`)
      }
      if (cp.executionMode === 'subagent') {
        console.log(`     子代理: ${cp.subagentGoal ?? '未提供 subagentGoal'}`)
      }
    }
    if (bp.openQuestions.length > 0) {
      console.log(`  ❓ 开放问题: ${bp.openQuestions.join('; ')}`)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 6. 自动化验证报告
  // ═══════════════════════════════════════════════════════════

  const report = buildVerificationReport(datasetState.data, session.patchLog, turns, session.blueprint)
  printVerificationReport(report)

  // 写入验证报告 JSON
  const reportPath = path.join(dataDir, 'sap-stills-report.json')
  fs.writeFileSync(reportPath, JSON.stringify({ ...report, totalElapsed, rounds: round }, null, 2), 'utf-8')
  console.log(`📄 验证报告 → ${reportPath}`)

  console.log(`\n⏱️  总耗时: ${(totalElapsed / 1000).toFixed(1)}s, ${round} 轮, ${turns.length} 条记录`)

  // 退出码：全部通过 → 0，否则 → 1
  if (report.checks.some(c => !c.pass)) {
    process.exit(1)
  }
}

// ═══════════════════════════════════════════════════════════
// 验证报告
// ═══════════════════════════════════════════════════════════

interface VerifyCheck {
  id: string
  label: string
  pass: boolean
  detail: string
}

interface VerificationReport {
  passed: number
  failed: number
  total: number
  checks: VerifyCheck[]
}

function buildVerificationReport(
  dataset: ReturnType<typeof getDataSetState>['data'],
  patchLog: Array<{ action: string; summary: string }>,
  turns: DialogueTurn[],
  blueprint: IStillSession['blueprint'],
): VerificationReport {
  const checks: VerifyCheck[] = []

  if (!dataset) {
    checks.push({ id: 'dataset-exists', label: 'DataSet 已创建', pass: false, detail: '会话中未创建 DataSet' })
    return { passed: 0, failed: 1, total: 1, checks }
  }

  const tables = Object.entries(dataset.tables)
  const tableNames = tables.map(([n]) => n)
  const relations: Array<{ parentTable: string; childTable: string; parentField: string; childField: string }> =
    (dataset.tableRelations as Array<{ parentTable: string; childTable: string; parentField: string; childField: string }>) ?? []

  // ── Check 1: 表数量 ≥ 4（请假申请单页面至少 4 表：申请、假别、员工、部门）
  checks.push({
    id: 'table-count',
    label: '表数量 ≥ 4',
    pass: tables.length >= 4,
    detail: `${tables.length} 张表: ${tableNames.join(', ')}`,
  })

  // ── Check 2: 每张表都有 API
  let mainTableName = ''
  let maxFkCount = -1
  for (const [name, t] of tables) {
    const fkCount = t.columns.filter((c) => {
      const cn = asDict(c)['name'] as string
      return cn && /Id$/u.test(cn) && cn !== 'id'
    }).length
    if (fkCount > maxFkCount) {
      maxFkCount = fkCount
      mainTableName = name
    }
  }
  const mainTable = mainTableName ? tables.find(([n]) => n === mainTableName)?.[1] : undefined
  const mainApi = mainTable?.api as Record<string, unknown> | undefined
  const missingCrudMethods = ['list', 'create', 'update', 'delete'].filter((method) => !mainApi?.[method])
  checks.push({
    id: 'main-table-crud-api',
    label: '主表 CRUD API 完整',
    pass: Boolean(mainTableName) && missingCrudMethods.length === 0,
    detail: mainTableName
      ? missingCrudMethods.length === 0
        ? `${mainTableName} 已配置 list/create/update/delete`
        : `${mainTableName} 缺少: ${missingCrudMethods.join(', ')}`
      : '未识别主表',
  })

  // ── Check 3: 每张表的 default 视图已配置（有 autoLoad / autoCurrentFirst / sortExpression 之一即可）
  const viewConfigured: string[] = []
  const viewNotConfigured: string[] = []
  for (const [name, t] of tables) {
    const dv = getViews(t)
    const def = dv?.['default']
    if (def && (def['autoLoad'] != null || def['autoCurrentFirst'] != null || def['sortExpression'] != null)) {
      viewConfigured.push(name)
    } else {
      viewNotConfigured.push(name)
    }
  }
  checks.push({
    id: 'all-views-configured',
    label: '每张表 default 视图已配置',
    pass: viewNotConfigured.length === 0,
    detail: viewNotConfigured.length === 0
      ? `${viewConfigured.length}/${tables.length} 全部配置`
      : `缺失: ${viewNotConfigured.join(', ')}`,
  })

  // ── Check 4: 核心外键列（xxxId）都有 relation
  // 排除自引用（parentId/managerId 引用同表 id 的场景）和辅助引用（nextXxxId 等链式字段）
  const coreFkColumns: Array<{ table: string; col: string }> = []
  const auxFkColumns: Array<{ table: string; col: string }> = []
  for (const [name, t] of tables) {
    for (const c of t.columns) {
      const colName = typeof c === 'object' && c !== null ? asDict(c)['name'] as string : ''
      if (!colName || !/Id$/.test(colName) || colName === 'id') continue
      // 自引用：parentId / managerId / supervisorId 通常指同表或通用辅助关系
      const isSelfRef = /^(parent|manager|supervisor)Id$/.test(colName)
      // 辅助引用：nextXxxId / specificXxxId 等链式/可选字段
      const isAux = /^(next|specific|current|previous)/.test(colName)
      if (isSelfRef || isAux) {
        auxFkColumns.push({ table: name, col: colName })
      } else {
        coreFkColumns.push({ table: name, col: colName })
      }
    }
  }
  const coreFkMissing = coreFkColumns.filter(
    fk => !relations.some(r => r.childTable === fk.table && r.childField === fk.col),
  )
  const auxFkMissing = auxFkColumns.filter(
    fk => !relations.some(r => r.childTable === fk.table && r.childField === fk.col),
  )
  checks.push({
    id: 'fk-have-relations',
    label: '核心外键列都有 relation',
    pass: coreFkMissing.length === 0,
    detail: coreFkMissing.length === 0
      ? `${coreFkColumns.length} 核心 FK 全覆盖` + (auxFkMissing.length > 0 ? ` (${auxFkMissing.length} 辅助 FK 未覆盖: ${auxFkMissing.map(f => `${f.table}.${f.col}`).join(', ')})` : '')
      : `缺失: ${coreFkMissing.map(f => `${f.table}.${f.col}`).join(', ')}`,
  })

  // ── Check 5: dependency 合理性（字典表做选项不应有多余 dependency）
  const deps: Array<{ parentTable: string; childTable: string }> =
    (dataset.viewDependencies as Array<{ parentTable: string; childTable: string }>) ?? []
  // 检查是否有不必要的 dependency（所有 dep 的父表应有真实的级联过滤场景）
  const depsCount = deps.length
  const uniqueRelPairs = [...new Set(relations.map(r => `${r.parentTable}→${r.childTable}`))]
  // 在单页面场景下，字典表→主表通常不需要 dependency（只是选项数据源）
  // 合理的 dependency 数量应 ≤ 关系数量，且 0 也可以是正确的（无级联需求时）
  checks.push({
    id: 'deps-reasonable',
    label: 'dependency 合理（无多余级联）',
    pass: depsCount === 0,
    detail: `${depsCount} 依赖 / ${uniqueRelPairs.length} 关系` +
      (depsCount === 0 ? ' (无级联需求，正确)' : ' (检测到多余 dependency)'),
  })

  // ── Check 6: 主表计算列已做聚合（leaveDays / 其他计算数值列）
  const computedNumericFields = (mainTable?.columns ?? [])
    .map((c) => asDict(c))
    .filter((column) => {
      const columnType = column['type']
      return column['computeExpression'] != null
        && (columnType === 'number' || columnType === 'decimal' || columnType === 'int' || columnType === 'integer')
    })
    .map((column) => String(column['name']))
  const rawAggregates = getViews(mainTable)?.['default']?.['aggregates']
  const mainAggregates = normalizeAggregateEntries(rawAggregates)
  const aggregatedComputedFields = mainAggregates
    .filter((aggregate) => aggregate.aggregate === 'sum')
    .map((aggregate) => aggregate.field)
    .filter((field) => computedNumericFields.includes(field))
  checks.push({
    id: 'computed-field-aggregated',
    label: '主表计算列已聚合',
    pass: computedNumericFields.length > 0 && aggregatedComputedFields.length > 0,
    detail: `计算列: ${computedNumericFields.join(', ') || '无'} | 已聚合: ${aggregatedComputedFields.join(', ') || '无'}`,
  })

  // ── Check 7: 计算列存在且为合法 JS 表达式（不含 SQL 函数）
  const computedCols: string[] = []
  const sqlFuncPattern = /\b(DATEDIFF|CONCAT|SUBSTR|UPPER|LOWER|COALESCE|IFNULL|NVL|DATEADD)\b/i
  const invalidComputedCols: string[] = []
  for (const [name, t] of tables) {
    for (const c of t.columns) {
      const col = asDict(c)
      const expr = col['computeExpression'] as string | undefined
      if (expr) {
        computedCols.push(`${name}.${col['name']}`)
        if (sqlFuncPattern.test(expr)) {
          invalidComputedCols.push(`${name}.${col['name']}=${expr}`)
        }
      }
    }
  }
  checks.push({
    id: 'computed-columns',
    label: '计算列为合法 JS 表达式',
    pass: computedCols.length > 0 && invalidComputedCols.length === 0,
    detail: invalidComputedCols.length > 0
      ? `❌ SQL 函数: ${invalidComputedCols.join('; ')}`
      : computedCols.length > 0
        ? `✓ ${computedCols.join(', ')}`
        : '无计算列',
  })

  // ── Check 7b: 主表 default 视图有 autoCurrentFirst
  const mainTableView = mainTable ? getViews(mainTable)?.['default'] : undefined
  const hasAutoCurrentFirst = mainTableView?.['autoCurrentFirst'] === true
  checks.push({
    id: 'main-table-auto-current-first',
    label: '主表 autoCurrentFirst',
    pass: hasAutoCurrentFirst,
    detail: hasAutoCurrentFirst
      ? `✓ ${mainTableName}.default 已配置 autoCurrentFirst: true`
      : `${mainTableName}.default 缺少 autoCurrentFirst: true`,
  })

  // ── Check 7c: 树形表的 options 视图有 treeConfig
  // 查找有自引用关系（parentId 指向同表 id）的表，检查其 options 视图是否配置了 treeConfig
  const treeTables: string[] = []
  const treeTablesWithConfig: string[] = []
  const treeTablesMissing: string[] = []
  for (const [name, t] of tables) {
    // 检查是否有 parentId 列（自引用树结构的标志）
    const hasParentId = t.columns.some((c) => {
      const cn = asDict(c)['name'] as string
      return cn === 'parentId'
    })
    if (!hasParentId) continue
    treeTables.push(name)
    const dv = getViews(t)
    const optionsView = dv?.['options']
    if (optionsView?.['treeConfig'] != null) {
      treeTablesWithConfig.push(name)
    } else {
      treeTablesMissing.push(name)
    }
  }
  checks.push({
    id: 'tree-options-have-treeconfig',
    label: '树形表 options 有 treeConfig',
    pass: treeTables.length > 0 && treeTablesMissing.length === 0,
    detail: treeTables.length === 0
      ? '无树形表'
      : treeTablesMissing.length === 0
        ? `✓ ${treeTablesWithConfig.join(', ')} 已配置 treeConfig`
        : `缺失: ${treeTablesMissing.join(', ')}`,
  })

  // ── Check 8: options 源表必须单独配置 options 视图，且 value/label 字段完整
  const optionTables: string[] = []
  const optionIssues: string[] = []
  for (const [name, t] of tables) {
    const optionsView = getViews(t)?.['options']
    if (!optionsView) continue
    optionTables.push(name)
    if (optionsView['viewId'] !== 'options') optionIssues.push(`${name}.options.viewId 应为 options`)
    if (!optionsView['valueField']) optionIssues.push(`${name}.options 缺少 valueField`)
    if (!optionsView['labelField']) optionIssues.push(`${name}.options 缺少 labelField`)
  }
  checks.push({
    id: 'options-views-configured',
    label: '选项源表单独配置 options 视图',
    pass: optionTables.length >= 3 && optionIssues.length === 0,
    detail: optionIssues.length === 0
      ? `${optionTables.length} 张表已配置 options: ${optionTables.join(', ') || '无'}`
      : optionIssues.join('; '),
  })

  // ── Check 9: options 源表必须有种子数据，且行字段/类型与列定义一致
  const rowIssues: string[] = []
  const optionSeedSummaries: string[] = []
  for (const [name, t] of tables) {
    const hasOptionsView = getViews(t)?.['options'] != null
    if (!hasOptionsView) continue

    const columnMap = new Map(
      t.columns.map((column) => {
        const dict = asDict(column)
        return [String(dict['name']), dict] as const
      }),
    )
    const primaryKeys = [...columnMap.values()]
      .filter((column) => column['isPrimaryKey'] === true)
      .map((column) => String(column['name']))
    const rows = (getViews(t)?.['default']?.['rows'] as unknown[] | undefined) ?? []

    if (rows.length === 0) {
      rowIssues.push(`${name}.default 缺少种子数据`)
      continue
    }
    optionSeedSummaries.push(`${name}(${rows.length}行)`)

    rows.forEach((rowValue, rowIndex) => {
      const row = asDict(rowValue)
      for (const key of Object.keys(row)) {
        if (key === '_pk') continue
        if (!columnMap.has(key)) {
          rowIssues.push(`${name}.rows[${rowIndex}].${key} 未声明为列`)
        }
      }
      for (const primaryKey of primaryKeys) {
        if (!(primaryKey in row) || row[primaryKey] === null || row[primaryKey] === undefined || row[primaryKey] === '') {
          rowIssues.push(`${name}.rows[${rowIndex}] 缺少主键列 ${primaryKey}`)
        }
      }
      for (const [columnName, column] of columnMap.entries()) {
        if (!(columnName in row)) {
          if (column['computeExpression'] == null) {
            rowIssues.push(`${name}.rows[${rowIndex}] 缺少列 ${columnName}`)
          }
          continue
        }
        if (!isCompatibleValue(column['type'], row[columnName])) {
          rowIssues.push(
            `${name}.rows[${rowIndex}].${columnName} 类型不匹配: 值=${JSON.stringify(row[columnName])}, 列类型=${String(column['type'])}`,
          )
        }
      }
    })
  }
  checks.push({
    id: 'option-seed-data-consistent',
    label: '选项源表种子数据与列定义一致',
    pass: rowIssues.length === 0,
    detail: rowIssues.length === 0 ? optionSeedSummaries.join(', ') : rowIssues.join('; '),
  })

  // ── Check 10: validate 已调用
  const validateCalled = patchLog.some(e => e.action === 'dataset.validate')
  checks.push({
    id: 'validate-called',
    label: 'dataset.validate 已调用',
    pass: validateCalled,
    detail: validateCalled ? '✓' : '未调用 validate',
  })

  // ── Check 11: export 已调用
  const exportCalled = patchLog.some(e => e.action === 'dataset.export')
  checks.push({
    id: 'export-called',
    label: 'dataset.export 已调用',
    pass: exportCalled,
    detail: exportCalled ? '✓' : '未调用 export',
  })

  // ── Check 12: blueprint.create 后，在首个非 blueprint 写动作前做过一次蓝图优化
  const blueprintCreateTurnIndex = turns.findIndex((turn) =>
    turn.phase === 'stills-execute'
    && turn.stillsResult?.ok === true
    && turn.sapBlock?.action === 'blueprint.create')
  const firstNonBlueprintWriteTurnIndex = turns.findIndex((turn, index) =>
    index > blueprintCreateTurnIndex
    && turn.phase === 'stills-execute'
    && turn.sapBlock?.type === 'request'
    && turn.sapBlock.action !== 'blueprint.create'
    && !turn.sapBlock.action.startsWith('blueprint.'))
  const optimizationWindow = blueprintCreateTurnIndex >= 0
    ? turns.slice(
      blueprintCreateTurnIndex + 1,
      firstNonBlueprintWriteTurnIndex >= 0 ? firstNonBlueprintWriteTurnIndex : undefined,
    )
    : []
  const optimizationActions = optimizationWindow
    .filter((turn) =>
      turn.phase === 'stills-execute'
      && turn.stillsResult?.ok === true
      && (turn.sapBlock?.action === 'blueprint.describe' || turn.sapBlock?.action === 'blueprint.revise'))
    .map((turn) => turn.sapBlock?.action ?? '')
  checks.push({
    id: 'blueprint-optimized-before-write',
    label: 'blueprint.create 后先优化蓝图',
    pass: optimizationActions.length > 0,
    detail: optimizationActions.length > 0
      ? optimizationActions.join(' → ')
      : '首个写动作前缺少 blueprint.describe / blueprint.revise',
  })

  // ── Check 13: 自检必须输出自然语言，不得退化为 SAP 协议块
  const selfCheckTurn = [...turns].reverse().find((turn) => turn.phase === 'self-check')
  const selfCheckText = selfCheckTurn?.aiText?.trim() ?? ''
  checks.push({
    id: 'self-check-natural-language',
    label: '自检输出自然语言结论',
    pass: selfCheckText.length > 0 && !isSapProtocolText(selfCheckText),
    detail: selfCheckText.length === 0
      ? '未执行 self-check'
      : isSapProtocolText(selfCheckText)
        ? `输出了协议块: ${selfCheckText.slice(0, 80)}`
        : selfCheckText.slice(0, 120),
  })

  // ── Check 14: 自检结论必须与硬校验结果一致
  const hardFailureCount = checks.filter((check) => !check.pass).length
  const selfCheckClaimsPass = /审查通过|无遗漏|完整无误/u.test(selfCheckText)
  const selfCheckClaimsFail = /审查失败/u.test(selfCheckText)
  checks.push({
    id: 'self-check-consistent',
    label: '自检结论与硬校验一致',
    pass: hardFailureCount === 0 ? !selfCheckClaimsFail : !selfCheckClaimsPass,
    detail: hardFailureCount === 0
      ? `硬校验失败数=${hardFailureCount}，自检输出=${selfCheckText.slice(0, 80) || '空'}`
      : `硬校验失败数=${hardFailureCount}，自检输出=${selfCheckText.slice(0, 80) || '空'}`,
  })

  // ── Check 15: 蓝图完成不得依赖脚本自动补全
  const autoBlueprintTurns = turns.filter((turn) => turn.sapBlock?.id?.includes('auto-blueprint'))
  checks.push({
    id: 'blueprint-no-auto-complete',
    label: '蓝图完成无脚本代补',
    pass: autoBlueprintTurns.length === 0,
    detail: autoBlueprintTurns.length === 0
      ? '✓'
      : autoBlueprintTurns.map((turn) => `${turn.sapBlock?.action}#${turn.sapBlock?.id}`).join(', '),
  })

  // ── Check 16: blueprint 全部完成
  const completedCheckpointCount = blueprint?.checkpoints.filter((checkpoint) => checkpoint.status === 'done').length ?? 0
  const totalCheckpointCount = blueprint?.checkpoints.length ?? 0
  const pendingCheckpoints = blueprint?.checkpoints
    .filter((checkpoint) => checkpoint.status !== 'done')
    .map((checkpoint) => checkpoint.id)
    ?? []
  checks.push({
    id: 'blueprint-fully-completed',
    label: 'blueprint 全部完成',
    pass: blueprint !== null && totalCheckpointCount > 0 && pendingCheckpoints.length === 0,
    detail: pendingCheckpoints.length === 0
      ? `${completedCheckpointCount}/${totalCheckpointCount} checkpoints 已完成`
      : `未完成: ${pendingCheckpoints.join(', ')}`,
  })

  const passed = checks.filter(c => c.pass).length
  return { passed, failed: checks.length - passed, total: checks.length, checks }
}

function printVerificationReport(report: VerificationReport): void {
  console.log('\n╔══════════════════════════════════════════════════════╗')
  console.log('║            验 证 报 告                               ║')
  console.log('╠══════════════════════════════════════════════════════╣')
  for (const c of report.checks) {
    const icon = c.pass ? '✅' : '❌'
    console.log(`║ ${icon} ${c.label.padEnd(28)} ${c.detail.slice(0, 40)}`)
  }
  console.log('╠══════════════════════════════════════════════════════╣')
  const verdict = report.failed === 0 ? '🎉 ALL PASSED' : `⚠️  ${report.failed} FAILED`
  console.log(`║  ${report.passed}/${report.total} 通过    ${verdict}`)
  console.log('╚══════════════════════════════════════════════════════╝')
}

// ═══════════════════════════════════════════════════════════
// 入口
// ═══════════════════════════════════════════════════════════

main().catch((err: unknown) => {
  console.error('\n💥 致命错误:', err)
  process.exit(1)
})
