/**
 * 真实 LLM 调用 — 捕获完整 AI↔Agent 对话记录
 *
 * 用法：npx tsx scripts/verify-ai-real-call.ts
 *
 * 前置条件：
 *   1. AI Server 运行中 (port 8080)
 *   2. OPENAI_API_KEY 已配置在服务端
 *
 * 输出：data/ai-dialogue-real.json — 完整对话记录（含 reasoning / delta / phase / result）
 */

const BASE_URL = 'http://localhost:8080'
let authToken = ''

// ─── 类型 ───────────────────────────────────────────────

interface DialogueEvent {
  timestamp: string
  elapsed: number        // ms since start
  type: 'request' | 'phase' | 'reasoning' | 'delta-batch' | 'usage' | 'result' | 'error' | 'done'
  data: unknown
}

interface Dialogue {
  startedAt: string
  prompt: string
  pageId: string
  events: DialogueEvent[]
  finalResult: AiResult | null
  totalElapsed: number
  tokenUsage: { prompt_tokens?: number; completion_tokens?: number; reasoning_tokens?: number } | null
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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!   // incomplete last line goes back to buffer

    let currentEvent = ''
    let currentData = ''

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        currentData = line.slice(5)
        // data 可能紧跟值无空格
        if (currentData.startsWith(' ')) currentData = currentData.slice(1)
      } else if (line === '' && currentEvent) {
        // blank line = end of event
        onEvent(currentEvent, currentData)
        currentEvent = ''
        currentData = ''
      }
    }
  }
}

// ─── 主流程 ──────────────────────────────────────────────

async function runRealAICall(): Promise<Dialogue> {
  const prompt = `请为大型企业设计一个请假申请管理页面：
1. 主表：请假申请列表（申请人、假别、起止日期、天数、状态、提交时间）
2. 子表：审批记录（审批人、角色、动作、意见、时间）
3. 左侧：假别类型树/列表，点击筛选右侧申请
4. 右上方：假期余额卡片（年假/病假/事假的总额/已用/剩余）
5. 支持新建申请表单（弹窗），包含假别选择、日期范围、事由、附件上传
6. 审批状态用不同颜色标签
7. 汇总行：申请总天数
8. 表间关系：假别→申请、申请→审批记录、员工→余额`

  const pageId = `leave-system-${Date.now()}`
  const sessionId = `sess-${Date.now()}`

  const requestBody = {
    action: 'generate',
    pageId,
    prompt,
    sessionId,
  }

  const startTime = Date.now()
  const events: DialogueEvent[] = []
  let finalResult: AiResult | null = null
  let tokenUsage: Dialogue['tokenUsage'] = null

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
  console.log(`   prompt: ${prompt.slice(0, 60)}...`)
  console.log(`   pageId: ${pageId}\n`)

  // ── 2. 发送请求 ──
  const response = await fetch(`${BASE_URL}/api/ai/chat/stream-page`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errText = await response.text()
    pushEvent('error', { status: response.status, body: errText })
    console.error(`❌ HTTP ${response.status}: ${errText}`)
    return buildDialogue(prompt, pageId, startTime, events, null, null)
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
        pushEvent('error', parsed)
        console.error(`\n❌ Error:`, parsed)
        break
      }
      case 'done': {
        flushDelta()
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

  return buildDialogue(prompt, pageId, startTime, events, finalResult, tokenUsage)
}

function buildDialogue(
  prompt: string,
  pageId: string,
  startTime: number,
  events: DialogueEvent[],
  finalResult: AiResult | null,
  tokenUsage: Dialogue['tokenUsage'],
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
  console.log('🔑 登录...')
  const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: 'default', username: 'admin', password: 'admin123' }),
  })
  if (!loginResp.ok) {
    console.error('❌ 登录失败:', await loginResp.text())
    process.exit(1)
  }
  const loginData = await loginResp.json() as { token: string; success: boolean }
  if (!loginData.success) { console.error('❌ 登录失败'); process.exit(1) }
  authToken = loginData.token
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
