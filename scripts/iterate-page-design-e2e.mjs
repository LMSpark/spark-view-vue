#!/usr/bin/env node
/**
 * 连续跑 page-design e2e，默认 10 轮；单轮 2 分钟无 LLM 活动即 abort 并进入下一轮。
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const e2eScript = join(scriptDir, 'verify-page-design-e2e.mjs')
const rounds = Number(process.env.AI_E2E_ROUNDS ?? '10')
const idleMs = process.env.AI_TURN_IDLE_TIMEOUT_MS ?? '120000'
const maxDemandMs = process.env.AI_MAX_DEMAND_MS ?? '360000'
const maxRounds = process.env.AI_MAX_TOOL_ROUNDS ?? '32'
const roundDelayMs = Number(process.env.AI_E2E_ROUND_DELAY_MS ?? '2000')
const backendUrl = process.env.AI_BACKEND_URL ?? 'http://localhost:8180'

const env = {
  ...process.env,
  AI_TURN_IDLE_TIMEOUT_MS: idleMs,
  AI_MAX_DEMAND_MS: maxDemandMs,
  AI_MAX_TOOL_ROUNDS: maxRounds,
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function printRoundDiagnostics(round, summary, exitCode) {
  const failedTools = summary.sessionSummary?.failedToolCallCount ?? '?'
  const toolCalls = summary.sessionSummary?.toolCallCount ?? 0
  const aborted = summary.steps?.sendDemand?.aborted === true
  const sendError = summary.steps?.sendDemand?.error
  process.stderr.write(
    `[iterate-page-design-e2e] round ${String(round)}: exit=${String(exitCode)} ok=${String(summary.ok)} tools=${String(toolCalls)} failedTools=${String(failedTools)} aborted=${String(aborted)} durationMs=${String(summary.steps?.sendDemand?.durationMs ?? '?')}\n`,
  )
  if (typeof sendError === 'string' && sendError.length > 0) {
    process.stderr.write(`  sendDemand.error: ${sendError}\n`)
  }
  const failures = summary.sessionSummary?.failedToolCalls ?? []
  if (failures.length > 0) {
    for (const failure of failures.slice(0, 3)) {
      process.stderr.write(`  - ${failure.toolName}: ${failure.code} ${failure.msg}\n`)
    }
  }
  const failureSummary = summary.failureSummary
    ?? (typeof summary.error === 'string' && summary.error.length > 0 ? [summary.error] : [])
  if (Array.isArray(failureSummary) && failureSummary.length > 0) {
    for (const reason of failureSummary.slice(0, 4)) {
      process.stderr.write(`  reason: ${reason}\n`)
    }
  } else if (toolCalls === 0 && summary.ok === false) {
    const persistence = summary.persistenceAssertions ?? {}
    process.stderr.write(`  reason: hasToolCalls=${String(persistence.hasToolCalls)} verifyArtifacts=${String(summary.steps?.verifyArtifacts)} login=${String(summary.steps?.login ?? '?')}\n`)
  }
}

async function assertBackendReachable() {
  try {
    const response = await fetch(`${backendUrl}/api/auth/login`, {
      method: 'OPTIONS',
    })
    if (response.status >= 500) {
      throw new Error(`backend unhealthy: ${response.status}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Java AI backend is not reachable at ${backendUrl}. Start spark-ai-server first. ${message}`,
    )
  }
}

await assertBackendReachable()

for (let round = 1; round <= rounds; round += 1) {
  if (round > 1 && Number.isFinite(roundDelayMs) && roundDelayMs > 0) {
    await sleep(roundDelayMs)
  }
  process.stderr.write(`\n[iterate-page-design-e2e] round ${String(round)}/${String(rounds)}\n`)
  const result = spawnSync(process.execPath, ['--import', 'tsx', e2eScript], {
    env: {
      ...env,
      AI_RUN_ID: `${Date.now().toString(36)}-${round.toString(36)}`,
    },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  if (stderr.trim().length > 0) process.stderr.write(stderr)
  let summary = null
  try {
    summary = JSON.parse(stdout)
  } catch {
    process.stderr.write(`[iterate-page-design-e2e] round ${String(round)}: invalid JSON output (exit=${String(result.status ?? '?')})\n`)
    process.stderr.write(stdout.slice(0, 4000))
    continue
  }
  printRoundDiagnostics(round, summary, result.status ?? 1)
  if (summary.ok === true) {
    console.log(JSON.stringify({ ok: true, round, summary }, null, 2))
    process.exit(0)
  }
}

console.log(JSON.stringify({ ok: false, rounds, message: 'all rounds failed' }, null, 2))
process.exit(2)
