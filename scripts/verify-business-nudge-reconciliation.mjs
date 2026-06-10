#!/usr/bin/env node

/**
 * Reconcile phase-3 "业务 Nudge 下沉" plan against the repo.
 * Writes docs/ai/business-nudge-sink-reconciliation.snapshot.json and exits non-zero on regression.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const SNAPSHOT_PATH = path.join(ROOT, 'docs/ai/business-nudge-sink-reconciliation.snapshot.json')
const PLAN_REF = '.cursor/plans/业务_nudge_下沉_7a9eee96.plan.md'

const FORBIDDEN_IN_SPARK_AI_KERNEL = [
  'openPageDesign',
  'editDataSet',
  'editNodeTree',
]

const KERNEL_SCAN_ROOTS = [
  'packages/spark-ai/src/agent/tool-loop',
  'packages/spark-ai/src/agent/native-runtime',
]

const VITEST_FILES = [
  'packages/spark-ai/src/tests/tool-loop-nudge-hooks.test.ts',
  'packages/spark-ai/src/tests/function-call-recovery-enricher.test.ts',
  'packages/spark-ai/src/tests/legacy-protocol-tool-names.test.ts',
  'tests/page/verify-rules.test.ts',
]

function readGitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : 'unknown'
}

function collectSourceFiles(dir) {
  const entries = []
  if (!fs.existsSync(dir)) return entries
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name)
    if (name.isDirectory()) {
      if (name.name === 'tests' || name.name === '__tests__') continue
      entries.push(...collectSourceFiles(full))
      continue
    }
    if (/\.(?:ts|mts|cts|js|mjs|cjs)$/u.test(name.name) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(name.name)) {
      entries.push(full)
    }
  }
  return entries
}

function scanKernelForForbiddenLiterals() {
  const hits = []
  for (const relRoot of KERNEL_SCAN_ROOTS) {
    const absRoot = path.join(ROOT, relRoot)
    for (const filePath of collectSourceFiles(absRoot)) {
      const rel = path.relative(ROOT, filePath).replace(/\\/g, '/')
      const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u)
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        for (const token of FORBIDDEN_IN_SPARK_AI_KERNEL) {
          if (line.includes(token)) {
            hits.push({ file: rel, line: index + 1, token })
          }
        }
      }
    }
  }
  return hits
}

function readFileContains(relPath, needles) {
  const abs = path.join(ROOT, relPath)
  const text = fs.readFileSync(abs, 'utf8')
  return needles.every((needle) => text.includes(needle))
}

const FORBIDDEN_PROTOCOL_HINT_FRAGMENTS = [
  'vcm_query 只接受',
  'vcm_model_guide 只接受',
  'vcm_attribute_guide 只接受',
  '不接受参数: modelName',
  '不接受参数: className',
  '勿传 member/select',
]

function scanForbiddenProtocolHintsInBusinessSop() {
  const abs = path.join(ROOT, 'src/services/page-design/page-design-sop.ts')
  const text = fs.readFileSync(abs, 'utf8')
  return FORBIDDEN_PROTOCOL_HINT_FRAGMENTS.filter((fragment) => text.includes(fragment))
}

function countInlineRecoveryMsgBranches(relPath) {
  const abs = path.join(ROOT, relPath)
  const text = fs.readFileSync(abs, 'utf8')
  const matches = text.match(/callResult\.msg\.includes/gu)
  return matches?.length ?? 0
}

function runCommand(label, command, args) {
  const startedAt = new Date().toISOString()
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', shell: true })
  return {
    label,
    command: [command, ...args].join(' '),
    exitCode: result.status ?? 1,
    startedAt,
    stdoutTail: (result.stdout ?? '').trim().split(/\r?\n/u).slice(-6).join('\n'),
    stderrTail: (result.stderr ?? '').trim().split(/\r?\n/u).slice(-6).join('\n'),
  }
}

function main() {
  const generatedAt = new Date().toISOString()
  const headCommit = readGitHead()
  const checks = []
  let regressionCount = 0

  const kernelHits = scanKernelForForbiddenLiterals()
  const kernelOk = kernelHits.length === 0
  checks.push({
    id: 'PLAN-KERNEL-LITERALS',
    title: 'spark-ai tool-loop / native-runtime 无业务方法字面量',
    status: kernelOk ? 'pass' : 'regression',
    evidence: kernelOk ? 'grep 0 hits' : kernelHits,
  })
  if (!kernelOk) regressionCount += 1

  const pageBizOk = readFileContains('src/services/page-design-business.ts', [
    'toolLoopNudge: createPageDesignToolLoopNudge',
    'enrichRecoveryHints: resolvePageDesignRecoveryHints',
    './page-design/page-design-sop',
  ])
  checks.push({
    id: 'PLAN-PAGE-DESIGN-HOOKS',
    title: 'page-design-business 实现 hooks 并委托 page-design-sop catalog',
    status: pageBizOk ? 'pass' : 'regression',
    evidence: pageBizOk ? 'src/services/page-design-business.ts' : 'missing hook or catalog import',
  })
  if (!pageBizOk) regressionCount += 1

  const sopCatalogOk = readFileContains('src/services/page-design/page-design-sop.ts', [
    'PAGE_DESIGN_RECOVERY_RULES',
    'pageDesignScriptShapeLines',
    'resolvePageDesignRecoveryHints',
  ])
  checks.push({
    id: 'PLAN-SOP-CATALOG',
    title: 'page-design-sop.ts 为 SOP SSOT',
    status: sopCatalogOk ? 'pass' : 'regression',
    evidence: sopCatalogOk ? 'src/services/page-design/page-design-sop.ts' : 'missing catalog exports',
  })
  if (!sopCatalogOk) regressionCount += 1

  const regTypesOk = readFileContains('packages/spark-ai/src/agent/business/registration-types.ts', [
    'toolLoopNudge?:',
    'executionToolNames?:',
    'planWithoutToolMarkers?:',
    'enrichRecoveryHints?:',
    'vcm_script_retry',
  ])
  checks.push({
    id: 'PLAN-REGISTRATION-CONTRACT',
    title: 'registration-types 扩展四类 hook',
    status: regTypesOk ? 'pass' : 'regression',
    evidence: regTypesOk ? 'registration-types.ts' : 'missing field',
  })
  if (!regTypesOk) regressionCount += 1

  const businessRecoveryBranches = countInlineRecoveryMsgBranches('src/services/page-design-business.ts')
  const sopDebtCleared = businessRecoveryBranches === 0 && sopCatalogOk
  checks.push({
    id: 'DEBT-SOP-THREE-CHANNEL',
    title: 'SOP 三通道收敛至 page-design-sop.ts（business 无内联 recovery 分支）',
    status: sopDebtCleared ? 'pass' : 'regression',
    evidence: {
      businessMsgIncludesBranches: businessRecoveryBranches,
      ssot: 'src/services/page-design/page-design-sop.ts',
    },
  })
  if (!sopDebtCleared) regressionCount += 1

  const protocolHintViolations = scanForbiddenProtocolHintsInBusinessSop()
  const protocolHintsOk = protocolHintViolations.length === 0
  checks.push({
    id: 'PLAN-KNOWLEDGE-SSOT',
    title: '业务 SOP 不硬编码 VCM 协议参数字段（知识来自原生 JSDoc / tool schema）',
    status: protocolHintsOk ? 'pass' : 'regression',
    evidence: protocolHintsOk
      ? 'page-design-sop.ts 无协议参数字面量 hint'
      : { forbiddenFragments: protocolHintViolations },
  })
  if (!protocolHintsOk) regressionCount += 1

  checks.push({
    id: 'DEBT-JSDOC-DUPLICATION',
    title: 'PAGE_DESIGN_HINTS 仍为 JSDoc 手工副本，待改为 ClassModel failureModes 派生',
    status: 'debt',
    evidence: {
      file: 'src/services/page-design/page-design-sop.ts',
      target: 'spark-project-model JSDoc @failureMode / @usageRule via VCM ClassModel',
    },
    action: '新 hint 写回 JSDoc；禁止在 PAGE_DESIGN_HINTS 扩写协议或业务契约副本',
  })

  checks.push({
    id: 'DEVIATION-REASON-NAME',
    title: 'nudge reason: plan module_script_retry → 实现 vcm_script_retry',
    status: 'deviation-positive',
    evidence: '与 VCM 协议命名一致，非回归',
  })

  const commands = []
  commands.push(runCommand('verify:arch', 'pnpm', ['run', 'verify:arch']))
  if (commands.at(-1).exitCode !== 0) regressionCount += 1

  commands.push(runCommand('vitest-nudge-suite', 'pnpm', ['exec', 'vitest', 'run', ...VITEST_FILES]))
  if (commands.at(-1).exitCode !== 0) regressionCount += 1

  const snapshot = {
    generatedAt,
    headCommit,
    planRef: PLAN_REF,
    regressionCount,
    noRegression: regressionCount === 0,
    checks,
    commands: commands.map(({ label, command, exitCode, startedAt }) => ({
      label,
      command,
      exitCode,
      startedAt,
    })),
    completionCriteria: {
      kernelNoBusinessLiterals: kernelOk,
      pageDesignSopInAppLayer: pageBizOk,
      sopCatalogSsot: sopCatalogOk,
      sopThreeChannelDebtCleared: sopDebtCleared,
      knowledgeSsotNoProtocolHardcode: protocolHintsOk,
      testsAndVerifyArchGreen: commands.every((item) => item.exitCode === 0),
    },
  }

  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true })
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')

  console.log('Business nudge reconciliation')
  console.log(`  head: ${headCommit}`)
  console.log(`  snapshot: ${path.relative(ROOT, SNAPSHOT_PATH)}`)
  for (const check of checks) {
    console.log(`  [${check.status}] ${check.id}: ${check.title}`)
  }
  for (const cmd of commands) {
    console.log(`  [${cmd.exitCode === 0 ? 'pass' : 'fail'}] ${cmd.label} (exit ${cmd.exitCode})`)
  }
  console.log(regressionCount === 0
    ? '\nNo regression against phase-3 plan completion criteria.'
    : `\nRegression count: ${regressionCount}`)

  process.exit(regressionCount === 0 ? 0 : 1)
}

main()
