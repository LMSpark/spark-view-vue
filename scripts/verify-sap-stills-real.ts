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

import { registerAllStills, createSession, executeStill } from '../packages/spark-ai/src/index.js'
import { getDataSetSlot } from '../packages/spark-ai/src/stills/dataset-domain.js'
import type { IStillSession } from '../packages/spark-ai/src/stills/types.js'
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

const STILLS_SYSTEM_PROMPT = loadStillsSystemPrompt() + '\n\n' + PROTOCOL_ONLY_INSTRUCTION

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

function getViews(table: unknown): Record<string, Record<string, unknown>> | undefined {
  return asDict(table)['views'] as Record<string, Record<string, unknown>> | undefined
}

function autoCompleteBlueprintAfterExport(session: IStillSession, requestId: string): ReturnType<typeof executeStill> | null {
  const blueprint = session.blueprint
  if (blueprint === null) return null

  const currentCheckpoint = blueprint.checkpoints.find(
    (checkpoint) => checkpoint.id === blueprint.currentCheckpointId,
  )
  if (!currentCheckpoint) return null

  if (blueprint.currentPlanItemId) {
    const currentPlanItem = currentCheckpoint.planItems.find(
      (planItem) => planItem.id === blueprint.currentPlanItemId,
    )
    if (currentPlanItem && currentPlanItem.status !== 'done' && currentPlanItem.action === 'dataset.export') {
      return executeStill(
        'blueprint.item.advance',
        {
          completedPlanItemId: currentPlanItem.id,
          checkpointId: currentCheckpoint.id,
          note: 'dataset.export 已完成，自动收尾蓝图',
        },
        session,
        `${requestId}-auto-blueprint-item-advance`,
      )
    }
  }

  if (currentCheckpoint.status !== 'done' && currentCheckpoint.plannedActions.includes('dataset.export')) {
    return executeStill(
      'blueprint.advance',
      {
        completedCheckpointId: currentCheckpoint.id,
        note: 'dataset.export 已完成，自动收尾蓝图',
      },
      session,
      `${requestId}-auto-blueprint-advance`,
    )
  }

  return null
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
  let lastErrorAction = ''

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
      { role: 'system', content: STILLS_SYSTEM_PROMPT },
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
        content: '[系统协议提醒]\n你必须只输出 SAP 协议块（@@describe 或 @@request），不要输出自然语言。请继续执行下一步操作。',
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
        content: '[系统协议错误]\n一次只允许输出 1 个 SAP 协议块。请只输出一个 @@request:<action>#<id> 或 @@describe:<action>#<id>。',
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

    // 构造 @@result / @@error 文本
    let resultText: string
    if (result.ok) {
      resultText = `@@result:${block.action}#${block.id}\n${JSON.stringify(result.data)}\n@@end`
      console.log(`  ✅ 成功 (${execElapsed}ms): ${result.summary}`)
      consecutiveErrors = 0
      lastErrorAction = ''

      // dataset.export 成功 → 立即退出循环，任务完成
      if (block.action === 'dataset.export') {
        const autoBlueprintResult = autoCompleteBlueprintAfterExport(session, block.id)
        if (autoBlueprintResult !== null) {
          if (!autoBlueprintResult.ok) {
            throw new Error(`dataset.export 后自动收尾蓝图失败: [${autoBlueprintResult.code}] ${autoBlueprintResult.msg}`)
          }
          console.log(`  ✅ 自动收尾蓝图: ${autoBlueprintResult.summary}`)
          turns.push({
            round,
            timestamp: new Date().toISOString(),
            phase: 'stills-execute',
            sapBlock: {
              type: 'request',
              action: autoBlueprintResult.summary.startsWith('推进 plan item:') ? 'blueprint.item.advance' : 'blueprint.advance',
              id: `${block.id}-auto-blueprint-complete`,
              params: autoBlueprintResult.summary,
            },
            stillsResult: { ok: true, data: autoBlueprintResult.data, summary: autoBlueprintResult.summary },
            elapsed: 0,
          })
        }
        console.log(`  🏁 dataset.export 完成，退出循环`)
        // 记录对话轮次后直接 break
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
          stillsResult: { ok: true, data: result.data, summary: result.summary },
          elapsed: Date.now() - roundStart,
        })
        finalSummary = '（任务完成，已导出 DataSet）'
        break
      }
    } else {
      resultText = `@@error:${block.action}#${block.id}\n${JSON.stringify({ code: result.code, msg: result.msg, fix: result.fix })}\n@@end`
      console.log(`  ❌ 失败: [${result.code}] ${result.msg}`)
      console.log(`     修复: ${result.fix}`)

      if (lastErrorAction === block.action) {
        consecutiveErrors++
      } else {
        consecutiveErrors = 1
        lastErrorAction = block.action
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
        : { ok: false, code: result.code, msg: result.msg, fix: result.fix },
      elapsed: Date.now() - roundStart,
    })

    // Step D: 注入结果回对话
    const followUpInstruction = result.ok && block.action === 'blueprint.create'
      ? '\n\n[系统编排要求]\n现在进入蓝图优化轮。下一轮先执行 blueprint.describe，审阅 checkpoints 的 dependsOn / relatedCheckpointIds / executionMode / subagentGoal；如缺失或不合理，先用 blueprint.revise 修正，然后再开始 dataset.init、datatable.create、relation.add 等写动作。蓝图优化只允许重排、拆分、补依赖，不允许删除原始业务动作覆盖范围。若拆分 checkpoint，拆分后的动作并集必须完整保留 default 视图配置、options 的 valueField/labelField、treeConfig、computeExpression、aggregates、datatable.addRows、dataset.validate、dataset.export。凡是需求写了 options 视图，就必须保留 dataview.create(options) + dataview.configure(options)，禁止把这些配置挪到 default 视图。'
      : ''
    if (followUpInstruction) {
      console.log('  🧭 已注入蓝图优化要求')
    }
    conversation.push({ role: 'assistant', content: aiReply })
    conversation.push({
      role: 'user',
      content: `[系统工具执行结果]\n${resultText}${followUpInstruction}`,
    })
  }

  // 如果内循环结束时还没有 finalSummary（达到 MAX_ROUNDS 或错误退出），请求一次总结
  if (!finalSummary && round >= MAX_ROUNDS) {
    console.log('\n⏱️  达到最大轮次，请求 AI 总结...')
    conversation.push({
      role: 'user',
      content: '你已完成数据模型设计工作。请总结本次设计的成果：包含哪些表、关系、视图，以及整体结构。',
    })
    const allMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: STILLS_SYSTEM_PROMPT },
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

  const selfCheckSlot = getDataSetSlot(session)
  if (selfCheckSlot.dataset && finalSummary) {
    console.log('\n🔍 AI 自检：将导出结果回传 LLM 审查...')

    // 构造精简的导出摘要（避免 token 过多）
    const exportedDs = selfCheckSlot.dataset
    const tablesSummary = Object.entries(exportedDs.tables).map(([name, t]) => {
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
        if (v['autoCurrentFirst']) flags.push('autoCurrentFirst')
        if (v['autoLoad']) flags.push('autoLoad')
        if (v['valueField']) flags.push(`valueField=${v['valueField']}`)
        if (v['labelField']) flags.push(`labelField=${v['labelField']}`)
        if (v['treeConfig']) flags.push('treeConfig')
        if (v['aggregates']) flags.push(`aggregates=${Object.keys(v['aggregates'] as object).join(',')}`)
        if (v['sortExpression']) flags.push(`sort=${v['sortExpression']}`)
        const rowCount = Array.isArray(v['rows']) ? (v['rows'] as unknown[]).length : 0
        if (rowCount > 0) flags.push(`${rowCount}行内联`)
        return `${vid}(${flags.join(', ')})`
      }).join('; ')
      const api = t.api ? Object.keys(t.api).join(',') : '无'
      return `  ${name}: 列=[${cols}] 视图=[${views}] API=[${api}]`
    }).join('\n')

    const relsSummary = (exportedDs.tableRelations ?? []).map((r) => {
      const relation = asDict(r)
      return `  ${relation['parentTable']}→${relation['childTable']} (${relation['parentField']}→${relation['childField']})`
    }).join('\n')

    const selfCheckPrompt = `以下是你刚才导出的 DataSet 的完整结构摘要，请仔细审查是否有遗漏或需要补充的内容。

═══ 导出结果摘要 ═══
DataSet: ${exportedDs.dataSetName}
表数: ${Object.keys(exportedDs.tables).length}

${tablesSummary}

关系:
${relsSummary || '  无'}

═══ 原始需求回顾 ═══
${USER_PROMPT}

═══ 审查要求 ═══
请逐项核对：
1. 每个需求点是否都在导出中体现？
2. 外键列是否都有对应的 relation？
3. 树形表的 options 视图是否有 treeConfig？
4. 主表是否配置了 autoCurrentFirst？
5. 计算列表达式是否为纯 JS（非 SQL）？
6. 选项表是否有内联数据？

如果一切完整无误，请回复"✅ 审查通过，无遗漏"。
如果有遗漏，请逐条列出需要补充的内容（不需要执行协议操作，只列出遗漏项即可）。`

    conversation.push({ role: 'assistant', content: '已完成 DataSet 导出。' })
    conversation.push({ role: 'user', content: selfCheckPrompt })

    const selfCheckMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: STILLS_SYSTEM_PROMPT },
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
  const slot = getDataSetSlot(session)
  if (slot.dataset) {
    const metadataPath = path.join(dataDir, 'sap-stills-metadata.json')
    fs.writeFileSync(metadataPath, JSON.stringify(slot.dataset, null, 2), 'utf-8')
    console.log(`📄 DataSet 元数据 → ${metadataPath}`)

    // 统计信息
    const tables = Object.keys(slot.dataset.tables)
    const totalColumns = tables.reduce(
      (sum, t) => sum + (slot.dataset!.tables[t]?.columns.length ?? 0),
      0,
    )
    const relations = slot.dataset.tableRelations?.length ?? 0

    console.log(`\n═══ 设计成果 ═══`)
    console.log(`  表: ${tables.length} (${tables.join(', ')})`)
    console.log(`  列: ${totalColumns}`)
    console.log(`  关系: ${relations}`)
    console.log(`  Schema 锁定: ${slot.schemaLocked}`)
    console.log(`  设计步骤: ${slot.currentStep}`)
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

  const report = buildVerificationReport(slot.dataset, session.patchLog, turns, session.blueprint)
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
  dataset: ReturnType<typeof getDataSetSlot>['dataset'],
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
  const tablesWithApi = tables.filter(([, t]) => t.api != null)
  const tablesNoApi = tables.filter(([, t]) => t.api == null).map(([n]) => n)
  checks.push({
    id: 'all-tables-have-api',
    label: '每张表都有 API 端点',
    pass: tablesNoApi.length === 0,
    detail: tablesNoApi.length === 0
      ? `${tablesWithApi.length}/${tables.length} 全部配置`
      : `缺失: ${tablesNoApi.join(', ')}`,
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
  const coverageRate = uniqueRelPairs.length > 0 ? depsCount / uniqueRelPairs.length : 0
  checks.push({
    id: 'deps-reasonable',
    label: 'dependency 合理（无多余级联）',
    pass: coverageRate <= 1,  // 不应超过关系总数
    detail: `${depsCount} 依赖 / ${uniqueRelPairs.length} 关系` +
      (depsCount === 0 ? ' (无级联需求，正确)' : ` (覆盖率 ${(coverageRate * 100).toFixed(0)}%)`),
  })

  // ── Check 6: 有数值列的视图配置了聚合
  const tablesWithNumericCols: string[] = []
  const tablesWithAggregates: string[] = []
  for (const [name, t] of tables) {
    const hasNumeric = t.columns.some((c) => {
      const column = asDict(c)
      return (column['type'] === 'number'
        || column['type'] === 'decimal'
        || column['type'] === 'int'
        || column['type'] === 'integer')
        && !(column['isComputed'] === true || column['computeExpression'] != null)
    })
    if (hasNumeric) tablesWithNumericCols.push(name)
    const dv = getViews(t)
    const def = dv?.['default']
    if (def?.['aggregates'] && Object.keys(def['aggregates'] as object).length > 0) {
      tablesWithAggregates.push(name)
    }
  }
  checks.push({
    id: 'numeric-have-aggregates',
    label: '数值表配置了聚合',
    pass: tablesWithAggregates.length > 0,
    detail: `数值表: ${tablesWithNumericCols.join(', ') || '无'} | 有聚合: ${tablesWithAggregates.join(', ') || '无'}`,
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
  // 找主表：有最多 xxxId 外键列的表（被最多字典/选项表引用的表）
  let mainTableName = ''
  let maxFkCount = -1
  for (const [name, t] of tables) {
    const fkCount = t.columns.filter((c) => {
      const cn = asDict(c)['name'] as string
      return cn && /Id$/.test(cn) && cn !== 'id'
    }).length
    if (fkCount > maxFkCount) { maxFkCount = fkCount; mainTableName = name }
  }
  const mainTable = mainTableName ? tables.find(([n]) => n === mainTableName)?.[1] : undefined
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

  // ── Check 8: 枚举/配置表有内联数据
  const tablesWithRows: Array<{ name: string; count: number }> = []
  for (const [name, t] of tables) {
    const dv = getViews(t)
    const def = dv?.['default']
    const rows = def?.['rows'] as unknown[] | undefined
    if (rows && rows.length > 0) {
      tablesWithRows.push({ name, count: rows.length })
    }
  }
  checks.push({
    id: 'config-tables-have-rows',
    label: '配置表有内联数据',
    pass: tablesWithRows.length > 0,
    detail: tablesWithRows.length > 0
      ? tablesWithRows.map(r => `${r.name}(${r.count}行)`).join(', ')
      : '无内联数据',
  })

  // ── Check 9: validate 已调用
  const validateCalled = patchLog.some(e => e.action === 'dataset.validate')
  checks.push({
    id: 'validate-called',
    label: 'dataset.validate 已调用',
    pass: validateCalled,
    detail: validateCalled ? '✓' : '未调用 validate',
  })

  // ── Check 10: export 已调用
  const exportCalled = patchLog.some(e => e.action === 'dataset.export')
  checks.push({
    id: 'export-called',
    label: 'dataset.export 已调用',
    pass: exportCalled,
    detail: exportCalled ? '✓' : '未调用 export',
  })

  // ── Check 11: blueprint.create 后，在首个非 blueprint 写动作前做过一次蓝图优化
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
