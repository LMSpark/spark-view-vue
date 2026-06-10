#!/usr/bin/env node

/**
 * 生成轨观测：跑 pageDesign E2E 抽样，落盘观测快照，不驱动 SOP/架构改动。
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const E2E_SCRIPT = path.join(ROOT, 'scripts/verify-page-design-e2e.mjs')
const SNAPSHOT_PATH = path.join(ROOT, 'docs/ai/page-design-e2e-observation.snapshot.json')
const rounds = Number(process.env.AI_E2E_ROUNDS ?? '3')
const backendUrl = process.env.AI_BACKEND_URL ?? 'http://localhost:8180'

function readGitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : 'unknown'
}

async function assertBackendReachable() {
  const response = await fetch(`${backendUrl}/api/auth/login`, { method: 'OPTIONS' })
  if (response.status >= 500) {
    throw new Error(`backend unhealthy: ${response.status}`)
  }
}

function runE2eRound(round) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', E2E_SCRIPT], {
    cwd: ROOT,
    env: {
      ...process.env,
      AI_RUN_ID: `observe-${Date.now().toString(36)}-${String(round)}`,
    },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  let summary = null
  let parseError = null
  try {
    summary = JSON.parse(result.stdout ?? '')
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error)
  }
  return {
    round,
    exitCode: result.status ?? 1,
    parseError,
    summary,
    stderrTail: (result.stderr ?? '').trim().split(/\r?\n/u).slice(-8).join('\n'),
  }
}

function summarizeRound(entry) {
  const summary = entry.summary
  if (summary === null || typeof summary !== 'object') {
    return {
      ok: false,
      toolCallCount: 0,
      failedToolCallCount: 0,
      pageId: null,
      failureReasons: [entry.parseError ?? 'invalid JSON output'],
    }
  }
  const sessionSummary = summary.sessionSummary ?? {}
  const failureSummary = Array.isArray(summary.failureSummary)
    ? summary.failureSummary
    : (typeof summary.error === 'string' ? [summary.error] : [])
  return {
    ok: summary.ok === true,
    toolCallCount: sessionSummary.toolCallCount ?? 0,
    failedToolCallCount: sessionSummary.failedToolCallCount ?? 0,
    pageId: summary.pageId ?? null,
    verifyArtifacts: summary.steps?.verifyArtifacts ?? null,
    durationMs: summary.steps?.sendDemand?.durationMs ?? null,
    failureReasons: failureSummary.slice(0, 6),
    failedTools: (sessionSummary.failedToolCalls ?? []).slice(0, 4).map((item) => ({
      toolName: item.toolName,
      code: item.code,
      msg: item.msg,
    })),
  }
}

await assertBackendReachable()

const generatedAt = new Date().toISOString()
const roundEntries = []
let firstSuccess = null

for (let round = 1; round <= rounds; round += 1) {
  process.stderr.write(`[report-page-design-e2e-observation] round ${String(round)}/${String(rounds)}\n`)
  const entry = runE2eRound(round)
  roundEntries.push(entry)
  const brief = summarizeRound(entry)
  process.stderr.write(
    `  ok=${String(brief.ok)} tools=${String(brief.toolCallCount)} failedTools=${String(brief.failedToolCallCount)}\n`,
  )
  if (brief.ok && firstSuccess === null) {
    firstSuccess = brief
  }
}

const snapshot = {
  generatedAt,
  headCommit: readGitHead(),
  purpose: 'generation-track observation only; does not gate CI or drive SOP changes',
  backendUrl,
  roundsRequested: rounds,
  roundsCompleted: roundEntries.length,
  firstSuccessRound: firstSuccess === null
    ? null
    : roundEntries.findIndex((entry) => summarizeRound(entry).ok) + 1,
  aggregate: {
    successCount: roundEntries.filter((entry) => summarizeRound(entry).ok).length,
    failureCount: roundEntries.filter((entry) => !summarizeRound(entry).ok).length,
  },
  rounds: roundEntries.map((entry) => ({
    round: entry.round,
    exitCode: entry.exitCode,
    brief: summarizeRound(entry),
    summary: entry.summary,
  })),
}

fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true })
fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')

console.log(JSON.stringify({
  ok: snapshot.aggregate.successCount > 0,
  snapshot: path.relative(ROOT, SNAPSHOT_PATH),
  aggregate: snapshot.aggregate,
  firstSuccessRound: snapshot.firstSuccessRound,
}, null, 2))

// 观测脚本以落盘为准；E2E 成败记入 snapshot，不作为本脚本退出码。
process.exit(0)
