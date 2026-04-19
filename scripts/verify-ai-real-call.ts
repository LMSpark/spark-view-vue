/**
 * 真实 LLM 调用 — 捕获完整 AI↔Agent 对话记录
 *
 * 用法：
 *   1) 生成模式：npx tsx scripts/verify-ai-real-call.ts --mode generate --scenario leave
 *   2) 细粒度编辑：
 *      npx tsx scripts/verify-ai-real-call.ts --mode iterate --pageId <pageId> \
 *        --currentFilesDir data/ai-output-<pageId> \
 *        --feedback "只调整状态标签颜色为蓝系，并把提交时间列标题改为申请时间"
 *
 * 前置条件：
 *   1. AI Server 运行中 (port 8080)
 *   2. OPENAI_API_KEY 已配置在服务端
 *
 * 输出：data/ai-dialogue-real.json — 完整对话记录（含 reasoning / delta / phase / result）
 */

import { existsSync, readFileSync } from 'node:fs'

const BASE_URL = process.env['AI_BACKEND_URL']?.replace(/\/+$/, '') || 'http://localhost:8080'
const AUTH_TENANT_ID = process.env['AI_TENANT_ID'] || 'lmspark'
const AUTH_USERNAME = process.env['AI_USERNAME'] || 'admin'
const AUTH_PASSWORD = process.env['AI_PASSWORD'] || 'admin123'
let authToken = ''

const PROMPT_SCENARIOS = {
  minimal: '生成一个最小页面，只需要一个标题和一个按钮。返回合法的页面配置 JSON。',
  medium: `请生成一个简单的员工列表页面：
1. 顶部一个标题“员工管理”
2. 一个查询栏，包含姓名输入框和状态下拉框
3. 一个员工表格，包含姓名、部门、岗位、状态四列
4. 一个“新建员工”按钮
5. 返回合法的页面配置 JSON。`,
  leave: `请为大型企业设计一个请假申请管理页面：
1. 主表：请假申请列表（申请人、假别、起止日期、天数、状态、提交时间）
2. 子表：审批记录（审批人、角色、动作、意见、时间）
3. 左侧：假别类型树/列表，点击筛选右侧申请
4. 右上方：假期余额卡片（年假/病假/事假的总额/已用/剩余）
5. 支持新建申请表单（弹窗），包含假别选择、日期范围、事由、附件上传
6. 审批状态用不同颜色标签
7. 汇总行：申请总天数
8. 表间关系：假别→申请、申请→审批记录、员工→余额`,
} as const

type PromptScenario = keyof typeof PROMPT_SCENARIOS
type CallMode = 'generate' | 'iterate'
type EditableFileName = 'rule.json' | 'style.css' | 'pagedata.json' | 'script.js'

const EDITABLE_FILES: EditableFileName[] = ['rule.json', 'style.css', 'pagedata.json', 'script.js']

interface RealRunConfig {
  mode: CallMode
  scenario: PromptScenario
  prompt: string
  pageId: string
  sessionId: string
  currentFiles: Record<string, string>
  feedback: string
}

function getArgValue(name: string): string | undefined {
  const lowerName = name.toLowerCase()
  const index = process.argv.findIndex(arg => arg.toLowerCase() === lowerName)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function parseMode(): CallMode {
  const rawMode = (getArgValue('--mode') || process.env['AI_REAL_MODE'] || 'generate').toLowerCase()
  return rawMode === 'iterate' ? 'iterate' : 'generate'
}

function parseEditableFiles(): EditableFileName[] {
  const raw = getArgValue('--includeFiles') || process.env['AI_REAL_INCLUDE_FILES'] || ''
  if (raw.trim() === '') return EDITABLE_FILES

  const parts = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const normalized = parts.filter((item): item is EditableFileName =>
    (EDITABLE_FILES as string[]).includes(item),
  )

  return normalized.length > 0 ? normalized : EDITABLE_FILES
}

function loadCurrentFiles(currentFilesDir: string, includeFiles: EditableFileName[]): Record<string, string> {
  if (!existsSync(currentFilesDir)) {
    throw new Error(`iterate 模式失败: currentFilesDir 不存在 -> ${currentFilesDir}`)
  }

  const files: Record<string, string> = {}
  for (const name of includeFiles) {
    const fullPath = `${currentFilesDir.replace(/[\\/]+$/, '')}/${name}`
    if (!existsSync(fullPath)) continue
    files[name] = readFileSync(fullPath, 'utf-8')
  }

  if (Object.keys(files).length === 0) {
    throw new Error(`iterate 模式失败: 在 ${currentFilesDir} 未读取到任何可编辑文件 (${includeFiles.join(', ')})`)
  }

  return files
}

function buildFineGrainedFeedback(rawFeedback: string): string {
  const trimmed = rawFeedback.trim()
  return [
    '请按细粒度编辑方式处理：仅修改与反馈直接相关的最小片段，未提及内容保持不变。',
    '如果只需改动某个文件，请不要重写其他文件。',
    `编辑指令：${trimmed}`,
  ].join('\n')
}

function resolvePromptConfig(): { scenario: PromptScenario; prompt: string } {
  const rawScenario = getArgValue('--scenario') || process.env['AI_REAL_SCENARIO'] || 'leave'
  const scenario = (rawScenario in PROMPT_SCENARIOS ? rawScenario : 'leave') as PromptScenario
  const customPrompt = getArgValue('--prompt') || process.env['AI_REAL_PROMPT']
  return {
    scenario,
    prompt: customPrompt && customPrompt.trim() !== '' ? customPrompt : PROMPT_SCENARIOS[scenario],
  }
}

function resolveRunConfig(): RealRunConfig {
  const mode = parseMode()
  const { scenario, prompt } = resolvePromptConfig()
  const rawPageId = getArgValue('--pageId') || process.env['AI_REAL_PAGE_ID']
  const pagePrefix = scenario === 'leave' ? 'leave-system' : `ai-${scenario}`
  const pageId = rawPageId && rawPageId.trim() !== '' ? rawPageId.trim() : `${pagePrefix}-${Date.now()}`
  const sessionId = getArgValue('--sessionId') || process.env['AI_REAL_SESSION_ID'] || `sess-${Date.now()}`

  if (mode === 'generate') {
    return {
      mode,
      scenario,
      prompt,
      pageId,
      sessionId,
      currentFiles: {},
      feedback: '',
    }
  }

  const currentFilesDir = getArgValue('--currentFilesDir') || process.env['AI_REAL_CURRENT_FILES_DIR']
  if (!currentFilesDir || currentFilesDir.trim() === '') {
    throw new Error('iterate 模式必须提供 --currentFilesDir 或 AI_REAL_CURRENT_FILES_DIR')
  }

  const rawFeedback = getArgValue('--feedback') || process.env['AI_REAL_FEEDBACK'] || prompt
  if (!rawFeedback || rawFeedback.trim() === '') {
    throw new Error('iterate 模式必须提供 --feedback 或 AI_REAL_FEEDBACK（或 --prompt）')
  }

  return {
    mode,
    scenario,
    prompt,
    pageId,
    sessionId,
    currentFiles: loadCurrentFiles(currentFilesDir, parseEditableFiles()),
    feedback: buildFineGrainedFeedback(rawFeedback),
  }
}

function createAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  if (AUTH_TENANT_ID) headers['X-Tenant-Id'] = AUTH_TENANT_ID
  return headers
}

async function login(): Promise<void> {
  const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': AUTH_TENANT_ID,
    },
    body: JSON.stringify({
      tenantId: AUTH_TENANT_ID,
      username: AUTH_USERNAME,
      password: AUTH_PASSWORD,
    }),
  })

  if (!loginResp.ok) {
    throw new Error(`登录失败: HTTP ${loginResp.status} ${await loginResp.text()}`)
  }

  const loginData = await loginResp.json() as { token?: string; success?: boolean }
  if (!loginData.success || !loginData.token) {
    throw new Error('登录失败: 未返回有效 token')
  }
  authToken = loginData.token
}

// ─── 类型 ───────────────────────────────────────────────

interface DialogueEvent {
  timestamp: string
  elapsed: number        // ms since start
  type: 'request' | 'phase' | 'reasoning' | 'delta-batch' | 'usage' | 'result' | 'error' | 'done'
  data: unknown
}

interface FileEditStat {
  file: string
  beforeChars: number
  afterChars: number
  changedLines: number
}

interface Dialogue {
  startedAt: string
  prompt: string
  pageId: string
  events: DialogueEvent[]
  finalResult: AiResult | null
  totalElapsed: number
  tokenUsage: { prompt_tokens?: number; completion_tokens?: number; reasoning_tokens?: number } | null
  editStats?: FileEditStat[]
  summary: string
}

interface AiResult {
  files: Record<string, string>
  explanation: string
  needsIteration: boolean
  iterationRound: number
}

// ─── SSE 解析 ─────────────────────────────────────────────

async function consumeSSE(
  response: Response,
  onEvent: (eventName: string, data: string) => void,
): Promise<void> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = 'message'
  let currentData: string[] = []

  const flushEvent = () => {
    if (!currentEvent || currentData.length === 0) return
    onEvent(currentEvent, currentData.join('\n'))
    currentEvent = 'message'
    currentData = []
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim() || 'message'
      } else if (line.startsWith('data:')) {
        let dataLine = line.slice(5)
        if (dataLine.startsWith(' ')) dataLine = dataLine.slice(1)
        currentData.push(dataLine)
      } else if (line === '') {
        flushEvent()
      }
    }
  }

  if (buffer.length > 0) {
    const trailing = buffer.trim()
    if (trailing.startsWith('data:')) {
      currentData.push(trailing.slice(5).trim())
    }
  }
  flushEvent()
}

// ─── 主流程 ──────────────────────────────────────────────

async function runRealAICall(): Promise<Dialogue> {
  const config = resolveRunConfig()

  const requestBody = config.mode === 'iterate'
    ? {
      action: 'iterate',
      pageId: config.pageId,
      sessionId: config.sessionId,
      feedback: config.feedback,
      currentFiles: config.currentFiles,
      logs: [],
    }
    : {
      action: 'generate',
      pageId: config.pageId,
      prompt: config.prompt,
      sessionId: config.sessionId,
    }

  const startTime = Date.now()
  const events: DialogueEvent[] = []
  let finalResult: AiResult | null = null
  let tokenUsage: Dialogue['tokenUsage'] = null
  let sawDone = false
  let sawError = false

  // 合并 delta 用于减少事件数
  let deltaBuffer: string[] = []
  let deltaFlushTimer: ReturnType<typeof setTimeout> | null = null

  const pushEvent = (type: DialogueEvent['type'], data: unknown) => {
    events.push({
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - startTime,
      type,
      data,
    })
  }

  const flushDelta = () => {
    if (deltaBuffer.length > 0) {
      pushEvent('delta-batch', {
        chunks: deltaBuffer.length,
        text: deltaBuffer.join(''),
      })
      deltaBuffer = []
    }
    deltaFlushTimer = null
  }

  // ── 1. 记录请求 ──
  pushEvent('request', {
    url: `${BASE_URL}/api/ai/chat/stream-page`,
    method: 'POST',
    body: requestBody,
  })

  console.log('🚀 发送请求到 AI Server (SSE streaming)...')
  console.log(`   mode: ${config.mode}`)
  console.log(`   scenario: ${config.scenario}`)
  if (config.mode === 'iterate') {
    console.log(`   feedback: ${config.feedback.slice(0, 120)}...`)
    console.log(`   currentFiles: ${Object.keys(config.currentFiles).join(', ')}`)
  } else {
    console.log(`   prompt: ${config.prompt.slice(0, 60)}...`)
  }
  console.log(`   pageId: ${config.pageId}\n`)

  // ── 2. 发送请求 ──
  const response = await fetch(`${BASE_URL}/api/ai/chat/stream-page`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...createAuthHeaders(),
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errText = await response.text()
    pushEvent('error', { status: response.status, body: errText })
    console.error(`❌ HTTP ${response.status}: ${errText}`)
    return buildDialogue(config.mode === 'iterate' ? config.feedback : config.prompt, config.pageId, startTime, events, null, null)
  }

  // ── 3. 消费 SSE 事件流 ──
  let reasoningChunks: string[] = []

  await consumeSSE(response, (eventName, rawData) => {
    let parsed: unknown
    try { parsed = JSON.parse(rawData) } catch { parsed = rawData }

    switch (eventName) {
      case 'phase': {
        flushDelta()
        const p = parsed as { phase: number; status: string; message: string }
        pushEvent('phase', p)
        console.log(`📊 Phase ${p.phase} [${p.status}] ${p.message}`)
        // 如果 reasoning 有积累，在 phase 切换时落盘
        if (reasoningChunks.length > 0) {
          pushEvent('reasoning', { text: reasoningChunks.join('') })
          console.log(`   🧠 Reasoning: ${reasoningChunks.join('').slice(0, 120)}...`)
          reasoningChunks = []
        }
        break
      }
      case 'delta': {
        const d = parsed as { delta: string }
        deltaBuffer.push(d.delta)
        process.stdout.write('▓')
        // 每 50 个 chunk 刷新一次
        if (deltaBuffer.length >= 50) flushDelta()
        break
      }
      case 'reasoning': {
        const r = parsed as { reasoning: string }
        reasoningChunks.push(r.reasoning)
        break
      }
      case 'usage': {
        const u = parsed as { usage: Record<string, number> }
        tokenUsage = { ...tokenUsage, ...u.usage }
        pushEvent('usage', u)
        console.log(`\n📈 Tokens: prompt=${u.usage.prompt_tokens ?? '?'}, completion=${u.usage.completion_tokens ?? '?'}`)
        break
      }
      case 'result': {
        flushDelta()
        if (reasoningChunks.length > 0) {
          pushEvent('reasoning', { text: reasoningChunks.join('') })
          reasoningChunks = []
        }
        finalResult = parsed as AiResult
        pushEvent('result', finalResult)
        console.log(`\n✅ Result received:`)
        console.log(`   explanation: ${finalResult.explanation}`)
        console.log(`   files: ${Object.keys(finalResult.files).join(', ')}`)
        console.log(`   needsIteration: ${finalResult.needsIteration}`)
        console.log(`   iterationRound: ${finalResult.iterationRound}`)
        break
      }
      case 'error': {
        flushDelta()
        sawError = true
        pushEvent('error', parsed)
        console.error(`\n❌ Error:`, parsed)
        break
      }
      case 'done': {
        flushDelta()
        sawDone = true
        pushEvent('done', parsed)
        console.log('\n✨ Stream completed')
        break
      }
      default: {
        pushEvent(eventName as DialogueEvent['type'], parsed)
        break
      }
    }
  })

  // 最后刷新
  flushDelta()

  if (!finalResult) {
    const diagnostic = {
      error: 'STREAM_ENDED_WITHOUT_RESULT',
      sawDone,
      sawError,
      totalEvents: events.length,
    }
    pushEvent('error', diagnostic)
    throw new Error(`页面流结束但未收到 result 事件: ${JSON.stringify(diagnostic)}`)
  }

  const editStats = config.mode === 'iterate' && finalResult
    ? computeEditStats(config.currentFiles, finalResult.files)
    : undefined

  if (editStats && editStats.length > 0) {
    console.log('\n🧩 细粒度变更统计:')
    for (const stat of editStats) {
      console.log(`   - ${stat.file}: changedLines=${stat.changedLines}, chars ${stat.beforeChars} -> ${stat.afterChars}`)
    }
  }

  return buildDialogue(
    config.mode === 'iterate' ? config.feedback : config.prompt,
    config.pageId,
    startTime,
    events,
    finalResult,
    tokenUsage,
    editStats,
  )
}

function countChangedLines(before: string, after: string): number {
  const a = before.split(/\r?\n/)
  const b = after.split(/\r?\n/)
  const max = Math.max(a.length, b.length)
  let changed = 0
  for (let i = 0; i < max; i += 1) {
    if ((a[i] ?? '') !== (b[i] ?? '')) changed += 1
  }
  return changed
}

function computeEditStats(currentFiles: Record<string, string>, finalFiles: Record<string, string>): FileEditStat[] {
  const keys = Array.from(new Set([...Object.keys(currentFiles), ...Object.keys(finalFiles)]))
  const stats: FileEditStat[] = []

  for (const file of keys) {
    const before = currentFiles[file] ?? ''
    const after = finalFiles[file] ?? ''
    const changedLines = countChangedLines(before, after)
    if (changedLines === 0) continue
    stats.push({
      file,
      beforeChars: before.length,
      afterChars: after.length,
      changedLines,
    })
  }

  return stats.sort((a, b) => b.changedLines - a.changedLines)
}

function buildDialogue(
  prompt: string,
  pageId: string,
  startTime: number,
  events: DialogueEvent[],
  finalResult: AiResult | null,
  tokenUsage: Dialogue['tokenUsage'],
  editStats?: FileEditStat[],
): Dialogue {
  const totalElapsed = Date.now() - startTime

  // 构建摘要
  const phases = events.filter(e => e.type === 'phase')
  const reasoning = events.filter(e => e.type === 'reasoning')
  const deltas = events.filter(e => e.type === 'delta-batch')
  const totalDeltaChunks = deltas.reduce((s, e) => s + ((e.data as { chunks: number }).chunks), 0)

  const summary = [
    `总耗时 ${(totalElapsed / 1000).toFixed(1)}s`,
    `${phases.length} 个 phase 事件`,
    `${totalDeltaChunks} 个 delta chunk`,
    reasoning.length > 0 ? `${reasoning.length} 段 reasoning` : 'no reasoning',
    tokenUsage ? `tokens: ${tokenUsage.prompt_tokens ?? '?'}+${tokenUsage.completion_tokens ?? '?'}` : 'no usage',
    finalResult ? `生成 ${Object.keys(finalResult.files).length} 个文件` : '无最终结果',
  ].join(' | ')

  return {
    startedAt: new Date(startTime).toISOString(),
    prompt,
    pageId,
    events,
    finalResult,
    totalElapsed,
    tokenUsage,
    editStats,
    summary,
  }
}

// ─── 入口 ─────────────────────────────────────────────────

async function main() {
  console.log('=' .repeat(60))
  console.log('  真实 LLM 调用 — AI ↔ Agent 对话记录捕获')
  console.log('=' .repeat(60))
  console.log()

  // 健康检查
  try {
    const health = await fetch(`${BASE_URL}/health`)
    if (!health.ok) throw new Error(`HTTP ${health.status}`)
    console.log('✅ AI Server 运行中')
  } catch {
    console.error('❌ AI Server 未启动 (localhost:8080)，请先运行: pnpm run dev')
    process.exit(1)
  }

  // 登录获取 token
  console.log(`🔑 登录... tenant=${AUTH_TENANT_ID} user=${AUTH_USERNAME}`)
  await login()
  console.log('✅ 已获取 token\n')

  const dialogue = await runRealAICall()

  // ── 写入文件 ──
  const { mkdirSync, writeFileSync } = await import('fs')
  mkdirSync('data', { recursive: true })

  // 完整对话记录
  const dialoguePath = 'data/ai-dialogue-real.json'
  writeFileSync(dialoguePath, JSON.stringify(dialogue, null, 2), 'utf-8')
  console.log(`\n💾 完整对话记录 → ${dialoguePath}`)

  // 如果有生成结果，单独保存各文件
  if (dialogue.finalResult) {
    const dir = `data/ai-output-${dialogue.pageId}`
    mkdirSync(dir, { recursive: true })
    for (const [filename, content] of Object.entries(dialogue.finalResult.files)) {
      if (content) {
        writeFileSync(`${dir}/${filename}`, content, 'utf-8')
        console.log(`   📄 ${dir}/${filename} (${content.length} chars)`)
      }
    }
  }

  console.log(`\n📊 摘要: ${dialogue.summary}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
