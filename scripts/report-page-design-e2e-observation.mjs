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
const SNAPSHOT_PATH = path.join(ROOT, 'notes/page-design-e2e-observation.snapshot.json')
const SUMMARY_PATH = path.join(ROOT, 'notes/page-design-e2e-observation.md')
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

function buildObservationMarkdown(snapshotData) {
  const lines = [
    '# pageDesign 生成轨观测摘要',
    '',
    '> 机器快照：[`page-design-e2e-observation.snapshot.json`](./page-design-e2e-observation.snapshot.json)',
    '> 命令：`pnpm run report:page-design:e2e`（可用 `AI_E2E_ROUNDS` 覆盖轮数）',
    '',
    '## 立场',
    '',
    '- **结构轨**（fixture + offline Vitest）为 CI 门禁，本观测**不驱动** SOP/架构改动。',
    '- 失败模式仅作 LLM 协议稳定性输入，新增 recovery 须经 catalog 表驱动评审。',
    '',
    `## 本次运行（${snapshotData.generatedAt}）`,
    '',
    `- HEAD: \`${snapshotData.headCommit}\``,
    `- 轮数: ${String(snapshotData.roundsCompleted)}/${String(snapshotData.roundsRequested)}`,
    `- 成功: ${String(snapshotData.aggregate.successCount)}，失败: ${String(snapshotData.aggregate.failureCount)}`,
    `- 首次成功轮: ${snapshotData.firstSuccessRound === null ? '无' : String(snapshotData.firstSuccessRound)}`,
    '',
    '## 分轮摘要',
    '',
  ]
  for (const round of snapshotData.rounds) {
    const brief = round.brief
    lines.push(`### Round ${String(round.round)}`)
    lines.push('')
    lines.push(`- ok: ${String(brief.ok)}`)
    lines.push(`- tools: ${String(brief.toolCallCount)}，failedTools: ${String(brief.failedToolCallCount)}`)
    lines.push(`- pageId: ${brief.pageId ?? '—'}`)
    lines.push(`- verifyArtifacts: ${String(brief.verifyArtifacts)}`)
    lines.push(`- durationMs: ${String(brief.durationMs ?? '—')}`)
    if (brief.failedTools.length > 0) {
      lines.push('- failedTools:')
      for (const tool of brief.failedTools) {
        lines.push(`  - \`${tool.toolName}\` / ${tool.code}: ${tool.msg}`)
      }
    }
    if (brief.failureReasons.length > 0) {
      lines.push('- reasons:')
      for (const reason of brief.failureReasons) {
        lines.push(`  - ${reason}`)
      }
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true })
fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
fs.writeFileSync(SUMMARY_PATH, buildObservationMarkdown(snapshot), 'utf8')

console.log(JSON.stringify({
  ok: snapshot.aggregate.successCount > 0,
  snapshot: path.relative(ROOT, SNAPSHOT_PATH),
  aggregate: snapshot.aggregate,
  firstSuccessRound: snapshot.firstSuccessRound,
}, null, 2))

// 观测脚本以落盘为准；E2E 成败记入 snapshot，不作为本脚本退出码。
process.exit(0)
