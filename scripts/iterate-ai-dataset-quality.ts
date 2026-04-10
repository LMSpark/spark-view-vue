/**
 * AI Dataset 生成质量迭代优化脚本 — FC 三阶段版
 *
 * 使用 generate-orchestrator 的三阶段 FC 管线代替旧的 SSE stream-page。
 *
 * 工作蓝图：
 *   1. 登录获取 token
 *   2. 加载组件目录（可选）
 *   3. 调用 runGenerateLoop → 三阶段 FC 循环（data → ui → style）
 *   4. 输出完整迭代报告
 *
 * 用法：npx tsx scripts/iterate-ai-dataset-quality.ts [--maxRounds 5] [--verbose] [--catalog path]
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { createGenerateSessionBackend } from '../packages/spark-ai/src/generate/generate-session-backend'
import { runGenerateLoop } from '../packages/spark-ai/src/generate/generate-orchestrator'
import type { GenerateProgressEvent, GenerateResult } from '../packages/spark-ai/src/generate/generate-orchestrator'
import type { ComponentCatalog } from '../packages/spark-ai/src/catalog/types'

const BASE_URL = 'http://localhost:8080'
let authToken = ''

// ─── CLI ──────────────────────────────────────────────────

interface CliOptions {
  maxRounds: number
  prompt: string
  pageId: string
  verbose: boolean
  catalogPath: string | null
}

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2)
  const o: CliOptions = {
    maxRounds: 8,
    prompt: '',
    pageId: `ds-iter-${Date.now()}`,
    verbose: false,
    catalogPath: null,
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--maxRounds' && args[i + 1]) o.maxRounds = Math.max(1, Number(args[++i]))
    else if (args[i] === '--prompt' && args[i + 1]) o.prompt = args[++i]!
    else if (args[i] === '--pageId' && args[i + 1]) o.pageId = args[++i]!
    else if (args[i] === '--verbose') o.verbose = true
    else if (args[i] === '--catalog' && args[i + 1]) o.catalogPath = args[++i]!
  }
  if (!o.prompt) {
    o.prompt = `请设计一个企业项目管理系统的任务看板页面：
1. 项目表（id, name, status, startDate, endDate, budget, description）— 左侧项目列表
2. 任务表（id, projectId, title, assignee, priority, status, dueDate, estimatedHours, actualHours）— 右侧任务列表，随项目切换联动
3. 任务评论表（id, taskId, author, content, createdAt）— 选择任务后显示评论
4. 团队成员表（id, name, role, email）— 用于 assignee 下拉选项
5. 项目统计卡片区：任务总数、已完成数、进行中数、总预算、已用工时
6. 汇总行：任务表的 estimatedHours 和 actualHours 求和
7. 计算列：任务表的 overtime = actualHours - estimatedHours
8. 表间关系：项目→任务、任务→评论、团队成员用作字典
9. 提供 3-5 条有代表性的测试数据
10. 主表开启 autoCurrentFirst`
  }
  return o
}

// ─── Catalog ──────────────────────────────────────────────

function loadCatalog(path: string | null): ComponentCatalog | null {
  if (!path) {
    const defaults = [
      'packages/spark-ai/src/catalog/component-catalog.ai.json',
      'dist/spark-component-metadata.json',
      'spark-ai-server/data/component-metadata.json',
    ]
    for (const d of defaults) {
      if (existsSync(d)) {
        try {
          console.log(`[catalog] Loading from ${d}`)
          return JSON.parse(readFileSync(d, 'utf-8')) as ComponentCatalog
        } catch (e) {
          console.warn(`[catalog] Failed to parse ${d}:`, e)
        }
      }
    }
    console.log('[catalog] No catalog found, proceeding without component knowledge')
    return null
  }

  if (!existsSync(path)) {
    console.warn(`[catalog] File not found: ${path}`)
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ComponentCatalog
  } catch (e) {
    console.warn(`[catalog] Failed to parse ${path}:`, e)
    return null
  }
}

// ─── Progress Logger ──────────────────────────────────────

function createProgressLogger(verbose: boolean) {
  const events: GenerateProgressEvent[] = []

  return {
    events,
    handler(event: GenerateProgressEvent) {
      events.push(event)
      switch (event.type) {
        case 'phase-start':
          console.log(`\n${'─'.repeat(50)}`)
          console.log(`Phase ${event.phaseIndex + 1}: ${event.phase}`)
          console.log(`${'─'.repeat(50)}`)
          break
        case 'round-start':
          console.log(`  Round ${event.round} [${event.phase}]`)
          break
        case 'tool-call':
          if (verbose) {
            console.log(`    → ${event.toolName}(${JSON.stringify(event.args).slice(0, 100)})`)
          } else {
            console.log(`    → ${event.toolName}`)
          }
          break
        case 'tool-result':
          if (verbose) {
            console.log(`    ← ${event.toolName}: ${event.ok ? 'OK' : 'FAIL'}`)
          }
          break
        case 'validation': {
          const icon = event.passed ? '✓' : '✗'
          console.log(`    [${event.layer}] ${icon} ${event.passed ? 'passed' : `${event.issues.length} issues`}`)
          if (!event.passed && verbose) {
            for (const issue of event.issues.slice(0, 5)) {
              console.log(`      - ${issue}`)
            }
          }
          break
        }
        case 'backtrack':
          console.log(`    ↩ Backtrack: ${event.from} → ${event.to} (${event.reason.slice(0, 80)})`)
          break
        case 'phase-complete':
          console.log(`  ✓ Phase ${event.phase} complete`)
          break
        case 'complete':
          console.log('\n*** GENERATION COMPLETE ***')
          break
        case 'error':
          console.error(`  ✗ Error: ${event.message}`)
          break
      }
    },
  }
}

// ─── Report ───────────────────────────────────────────────

function writeReport(
  opt: CliOptions,
  result: GenerateResult,
  events: GenerateProgressEvent[],
  elapsed: number,
) {
  const outDir = `data/ds-iterate-${opt.pageId}`
  mkdirSync(outDir, { recursive: true })

  const files: Record<string, string> = {}
  if (result.artifacts.pagedata) { files['pagedata.json'] = result.artifacts.pagedata; writeFileSync(`${outDir}/pagedata.json`, result.artifacts.pagedata) }
  if (result.artifacts.ruleJson) { files['rule.json'] = result.artifacts.ruleJson; writeFileSync(`${outDir}/rule.json`, result.artifacts.ruleJson) }
  if (result.artifacts.scriptJs) { files['script.js'] = result.artifacts.scriptJs; writeFileSync(`${outDir}/script.js`, result.artifacts.scriptJs) }
  if (result.artifacts.styleCss) { files['style.css'] = result.artifacts.styleCss; writeFileSync(`${outDir}/style.css`, result.artifacts.styleCss) }

  const summary = [
    result.success ? 'CONVERGED' : 'NOT_CONVERGED',
    `${result.totalRounds} rounds`,
    `${(elapsed / 1000).toFixed(1)}s`,
    `phases: ${result.phaseSummary.map(p => `${p.phase}=${p.rounds}r`).join(' ')}`,
    `files: ${Object.keys(files).join(', ')}`,
  ].join(' | ')

  // 工具调用统计
  const toolCallEvents = events.filter(e => e.type === 'tool-call') as Array<{ type: 'tool-call'; toolName: string; args: unknown; phase: string }>
  const toolFreq: Record<string, number> = {}
  const toolArgLog: Array<{ phase: string; tool: string; args: unknown }> = []
  for (const e of toolCallEvents) {
    toolFreq[e.toolName] = (toolFreq[e.toolName] ?? 0) + 1
    toolArgLog.push({ phase: e.phase, tool: e.toolName, args: e.args })
  }

  const report = {
    startedAt: new Date(Date.now() - elapsed).toISOString(),
    pageId: opt.pageId,
    originalPrompt: opt.prompt,
    totalRounds: result.totalRounds,
    totalElapsed: elapsed,
    sessionId: result.sessionId,
    success: result.success,
    error: result.error,
    phaseSummary: result.phaseSummary,
    eventCount: events.length,
    files: Object.keys(files),
    fileSizes: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length])),
    summary,
    toolCallFrequency: toolFreq,
    toolCallLog: toolArgLog,
    allEvents: events,
  }

  writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2))

  console.log(`\nOutput → ${outDir}/`)
  for (const [fn, c] of Object.entries(files)) {
    console.log(`  ${outDir}/${fn} (${c.length} chars)`)
  }
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  ${summary}`)
  console.log(`${'═'.repeat(60)}`)
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  const opt = parseCliArgs()
  console.log('═'.repeat(60))
  console.log('  AI Dataset Quality Iteration (FC Three-Phase)')
  console.log('═'.repeat(60))
  console.log(`  maxRounds=${opt.maxRounds}  verbose=${opt.verbose}  pageId=${opt.pageId}`)
  console.log(`  prompt: ${opt.prompt.slice(0, 80)}...\n`)

  // Health check
  try {
    const h = await fetch(`${BASE_URL}/health`)
    if (!h.ok) throw new Error(`${h.status}`)
  } catch {
    console.error('[FAIL] Server not running at', BASE_URL)
    process.exit(1)
  }
  console.log('[OK] Server running')

  // Login
  const lr = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: 'default', username: 'admin', password: 'admin123' }),
  })
  if (!lr.ok) { console.error('[FAIL] Login:', await lr.text()); process.exit(1) }
  const ld = await lr.json() as { token: string; success: boolean }
  if (!ld.success) { console.error('[FAIL] Login failed'); process.exit(1) }
  authToken = ld.token
  console.log('[OK] Logged in')

  // Load catalog
  const catalog = loadCatalog(opt.catalogPath)

  // Create backend
  const backend = createGenerateSessionBackend({
    baseUrl: BASE_URL,
    token: authToken,
  })

  // Progress logger
  const { events, handler } = createProgressLogger(opt.verbose)

  // Run three-phase generation
  const t0 = Date.now()
  let result: GenerateResult

  try {
    result = await runGenerateLoop(backend, {
      userPrompt: opt.prompt,
      catalog,
      maxRoundsPerPhase: opt.maxRounds,
      maxBacktracks: 1,
      slidingWindow: 30,
      onProgress: handler,
    })
  } catch (e) {
    console.error('\n[FAIL] Generate loop:', e)
    process.exit(1)
  }

  const elapsed = Date.now() - t0

  // Cleanup session
  try {
    await backend.destroyAllSessions()
    console.log('[OK] Session cleaned up')
  } catch {
    console.warn('[WARN] Failed to cleanup session')
  }

  // Write report
  writeReport(opt, result, events, elapsed)

  if (!result.success) {
    console.error(`\nGeneration failed: ${result.error ?? 'unknown'}`)
    process.exit(1)
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
