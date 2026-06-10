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
  'packages/spark-ai/src/vcm-native/tests/vcm-failure-mode-recovery.test.ts',
  'packages/spark-ai/src/vcm-native/tests/class-model-reflection-connectivity.test.ts',
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
    './page-design/page-design-sop',
  ]) && !fs.readFileSync(path.join(ROOT, 'src/services/page-design-business.ts'), 'utf8').includes('enrichRecoveryHints:')
  checks.push({
    id: 'PLAN-PAGE-DESIGN-HOOKS',
    title: 'page-design-business 仅编排 nudge；recovery 由 VCM metadata 自动派生',
    status: pageBizOk ? 'pass' : 'regression',
    evidence: pageBizOk ? 'src/services/page-design-business.ts' : 'missing nudge hook or still has enrichRecoveryHints',
  })
  if (!pageBizOk) regressionCount += 1

  const adapterText = fs.readFileSync(path.join(ROOT, 'packages/spark-ai/src/agent/business/vcm-native-agent-adapter.ts'), 'utf8')
  const vcmAutoRecoveryOk = adapterText.includes('collectVcmFailureModeRecoveryHints')
    && adapterText.includes('buildVcmNativeEnrichRecoveryHints')
    && !adapterText.includes('collectVcmClassModelRecoveryHints')
    && !fs.existsSync(path.join(ROOT, 'packages/spark-ai/src/vcm-native/recovery/class-model-knowledge-index.ts'))
  checks.push({
    id: 'PLAN-VCM-AUTO-RECOVERY',
    title: 'recovery 仅来自 metadata @failureMode，不遍历 ClassModel 图',
    status: vcmAutoRecoveryOk ? 'pass' : 'regression',
    evidence: vcmAutoRecoveryOk
      ? 'collectVcmFailureModeRecoveryHints + vcm-native-agent-adapter.ts'
      : 'recovery 仍绑定 ClassModel 或缺少 failureMode 派生',
  })
  if (!vcmAutoRecoveryOk) regressionCount += 1

  const sopCatalogOk = readFileContains('src/services/page-design/page-design-sop.ts', [
    'buildPageDesignToolLoopNudge',
  ]) && !fs.readFileSync(path.join(ROOT, 'src/services/page-design/page-design-sop.ts'), 'utf8').includes('PAGE_DESIGN_RECOVERY_RULES')
  checks.push({
    id: 'PLAN-SOP-CATALOG',
    title: 'page-design-sop.ts 仅保留 nudge 编排（无业务知识副本）',
    status: sopCatalogOk ? 'pass' : 'regression',
    evidence: sopCatalogOk ? 'src/services/page-design/page-design-sop.ts' : 'missing nudge exports or still has recovery rules',
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
  const sopRecoveryBranches = countInlineRecoveryMsgBranches('src/services/page-design/page-design-sop.ts')
  const recoveryDebtCleared = businessRecoveryBranches === 0 && sopRecoveryBranches === 0
  checks.push({
    id: 'DEBT-SOP-THREE-CHANNEL',
    title: 'recovery 不再由 app SOP msg.includes 表驱动（VCM @failureMode 自动派生）',
    status: recoveryDebtCleared ? 'pass' : 'regression',
    evidence: {
      businessMsgIncludesBranches: businessRecoveryBranches,
      sopMsgIncludesBranches: sopRecoveryBranches,
      vcmAutoRecovery: 'packages/spark-ai/src/vcm-native/recovery/vcm-failure-mode-recovery.ts',
    },
  })
  if (!recoveryDebtCleared) regressionCount += 1

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

  const planningBizText = fs.readFileSync(path.join(ROOT, 'src/services/project-planning-business.ts'), 'utf8')
  const planningRecoveryRemoved = !planningBizText.includes('enrichRecoveryHints:')
    && !planningBizText.includes('callResult.msg.includes')
  checks.push({
    id: 'PLAN-PROJECT-PLANNING-NO-HARDCODE',
    title: 'project-planning-business 无手写 recovery / msg.includes 知识',
    status: planningRecoveryRemoved ? 'pass' : 'regression',
    evidence: planningRecoveryRemoved ? 'src/services/project-planning-business.ts' : 'still has hardcoded recovery',
  })
  if (!planningRecoveryRemoved) regressionCount += 1

  const classModelTypes = fs.readFileSync(path.join(ROOT, 'packages/spark-ai/src/vcm-native/class-model/types.ts'), 'utf8')
  const fromRuntimeMetadata = fs.readFileSync(path.join(ROOT, 'packages/spark-ai/src/vcm-native/class-model/from-runtime-metadata.ts'), 'utf8')
  const classModelIsPureIndex = !classModelTypes.includes('diagnostics:')
    && !classModelTypes.includes('callbackTargetKind')
    && !classModelTypes.includes('returnsKind')
    && !classModelTypes.includes('models:')
    && !fromRuntimeMetadata.includes('resolveMethodNavigation')
    && !fs.existsSync(path.join(ROOT, 'packages/spark-ai/src/vcm-native/class-model/class-model-graph.ts'))
    && !fromRuntimeMetadata.includes('assertClassModelGraph')
    && !fromRuntimeMetadata.includes('auditClassModel')
  checks.push({
    id: 'PLAN-CLASSMODEL-PURE-INDEX',
    title: 'ClassModel 纯知识索引：module + 属性链按需投影 + vcm_*_guide，无 diagnostics/图审计旁路',
    status: classModelIsPureIndex ? 'pass' : 'regression',
    evidence: classModelIsPureIndex
      ? 'ClassModelDocument.module + 属性链按需投影（无预存 models）'
      : '仍存在 diagnostics 或图审计旁路',
  })
  if (!classModelIsPureIndex) regressionCount += 1

  const promptQueryKindAligned = adapterText.includes('listAttributeReachableKinds(document)')
    && adapterText.includes('属性链可达模型（与 vcm_query 一致）')
  checks.push({
    id: 'PLAN-PROMPT-QUERY-KIND-ALIGN',
    title: 'promptSnapshot 与 vcm_query 同列 attribute 链可达 kind',
    status: promptQueryKindAligned ? 'pass' : 'regression',
    evidence: promptQueryKindAligned
      ? 'createVcmNativePromptSnapshot → listAttributeReachableKinds'
      : 'prompt 仍列全 apiRegistry 或语义未对齐',
  })
  if (!promptQueryKindAligned) regressionCount += 1

  const refreshInspectionPath = path.join(ROOT, 'scripts/refresh-vcm-inspection.mjs')
  const refreshInspectionText = fs.readFileSync(refreshInspectionPath, 'utf8')
  const refreshInspectionCurrent = refreshInspectionText.includes('listAttributeReachableKinds')
    && refreshInspectionText.includes('projectClassModelForGuide')
    && !refreshInspectionText.includes('classModel.models')
  checks.push({
    id: 'PLAN-REFRESH-INSPECTION-CURRENT',
    title: 'refresh-vcm-inspection 按属性链投影，不读 ClassModelDocument.models',
    status: refreshInspectionCurrent ? 'pass' : 'regression',
    evidence: refreshInspectionCurrent ? 'scripts/refresh-vcm-inspection.mjs' : 'inspection 脚本仍依赖预存 models',
  })
  if (!refreshInspectionCurrent) regressionCount += 1

  const auditScriptPath = path.join(ROOT, 'scripts/audit-vcm-build-output.mjs')
  const auditScriptText = fs.readFileSync(auditScriptPath, 'utf8')
  const auditScriptWired = auditScriptText.includes('listAttributeReachableKinds')
    && auditScriptText.includes('REFLECTION_KIND_UNREACHABLE_VIA_ATTRIBUTES')
    && auditScriptText.includes('signatureContainsProblematicUnknown')
    && auditScriptText.includes('forbiddenProjectionFields')
    && fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8').includes('"audit:vcm-build-output"')
    && fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8').includes('scripts/audit-vcm-build-output.mjs')
  checks.push({
    id: 'PLAN-AUDIT-VCM-BUILD-WIRED',
    title: 'audit-vcm-build-output 接入 verify:vcm-native 且属性链断路为 error',
    status: auditScriptWired ? 'pass' : 'regression',
    evidence: auditScriptWired
      ? 'package.json verify:vcm-native + scripts/audit-vcm-build-output.mjs'
      : 'audit 脚本未接线或仍仅 warn 属性链',
  })
  if (!auditScriptWired) regressionCount += 1

  checks.push({
    id: 'DEBT-JSDOC-DUPLICATION',
    title: 'ClassModel=知识索引(guide)；recovery=@failureMode；app 只注入动态上下文',
    status: 'debt',
    evidence: {
      knowledgeIndex: 'ClassModelDocument.module → 属性链投影 → vcm_query / vcm_*_guide',
      recovery: 'packages/spark-ai/src/vcm-native/recovery/vcm-failure-mode-recovery.ts',
    },
    action: '属性链已通 page-design 六 kind；持续在源码补 JSDoc/@failureMode，勿在 runtime 补旁路',
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
      pageDesignNudgeOnlyInAppLayer: pageBizOk,
      vcmAutoRecoveryWired: vcmAutoRecoveryOk,
      sopNudgeOrchestrationOnly: sopCatalogOk,
      recoveryDebtCleared,
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
