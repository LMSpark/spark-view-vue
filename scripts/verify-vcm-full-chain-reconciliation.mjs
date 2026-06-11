#!/usr/bin/env node

/**
 * VCM 全链路对账：源码语义 → 生成产物 → ClassModel 投影 → recovery/Worker 接线。
 * 写入 docs/ai/vcm-full-chain-reconciliation.snapshot.json；有 regression 时 exit 1。
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const SNAPSHOT_PATH = path.join(ROOT, 'docs/ai/vcm-full-chain-reconciliation.snapshot.json')
const SPEC_REF = 'docs/ai/VCM_NATIVE_CLASS_SPEC.md'

const DIST_TARGETS = [
  {
    id: 'project-page-surface',
    runtime: 'generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime.generated.json',
    compileReport: 'generated/vcm/project-page-surface/vcm-compile-report.json',
    manifest: 'generated/vcm/project-page-surface/manifest.json',
  },
]

const EXPECTED_REACHABLE_KINDS = [
  'NavigationRowModel',
  'PageConfigModel',
  'ProjectRootModel',
]

const REQUIRED_FAILURE_MODES = []

const VITEST_FILES = [
  'packages/spark-ai/src/vcm-native/tests/class-model.test.ts',
  'packages/spark-ai/src/vcm-native/tests/vcm-native-tool-schema-recovery.test.ts',
  'packages/spark-ai/src/vcm-native/tests/vcm-bundle-assembler.test.ts',
  'packages/vite-plugin-spark-catalog/src/tests/module-metadata-generator.test.ts',
  'packages/spark-project-model/tests/domain-model',
]

function readGitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : 'unknown'
}

function readJson(relPath) {
  const abs = path.join(ROOT, relPath)
  if (!fs.existsSync(abs)) return undefined
  return JSON.parse(fs.readFileSync(abs, 'utf8'))
}

function runCommand(label, command, args) {
  const startedAt = new Date().toISOString()
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', shell: true })
  return {
    label,
    command: [command, ...args].join(' '),
    exitCode: result.status ?? 1,
    startedAt,
    stdoutTail: (result.stdout ?? '').trim().split(/\r?\n/u).slice(-8).join('\n'),
    stderrTail: (result.stderr ?? '').trim().split(/\r?\n/u).slice(-8).join('\n'),
  }
}

function loadModule(runtime) {
  return runtime?.modules?.[0]
}

function resolveApi(module, kind) {
  if (module.rootApi.kind === kind) return module.rootApi
  return module.apiRegistry?.[kind]
}

function listActionFailureCodes(api, actionName) {
  const action = api?.actions?.find(item => item.name === actionName)
  return (action?.failureModes ?? []).map(mode => mode.code)
}

function summarizeRootActions(module) {
  return (module.rootApi.actions ?? []).map(action => ({
    name: action.name,
    failureCodes: (action.failureModes ?? []).map(mode => mode.code).sort(),
  }))
}

function compareRootActionParity(modelModule, surfaceModule) {
  const modelActions = summarizeRootActions(modelModule)
  const surfaceActions = summarizeRootActions(surfaceModule)
  const mismatches = []
  for (const modelAction of modelActions) {
    const surfaceAction = surfaceActions.find(item => item.name === modelAction.name)
    if (surfaceAction === undefined) {
      mismatches.push({ action: modelAction.name, reason: 'missing on project-page-surface' })
      continue
    }
    if (JSON.stringify(modelAction.failureCodes) !== JSON.stringify(surfaceAction.failureCodes)) {
      mismatches.push({
        action: modelAction.name,
        reason: 'failureModes differ',
        model: modelAction.failureCodes,
        surface: surfaceAction.failureCodes,
      })
    }
  }
  return mismatches
}

function collectReachableKindsFromManifest(manifest) {
  const kinds = new Set([manifest.rootKind])
  for (const entry of Object.values(manifest.kinds ?? {})) {
    kinds.add(entry.kind)
    for (const importKind of entry.importKinds ?? []) {
      kinds.add(importKind)
    }
  }
  return [...kinds].sort()
}

function main() {
  const generatedAt = new Date().toISOString()
  const headCommit = readGitHead()
  const checks = []
  let regressionCount = 0

  const specText = fs.readFileSync(path.join(ROOT, SPEC_REF), 'utf8')
  const threeLayerOk = specText.includes('三层真源')
    && specText.includes('TS 类型是结构真源')
    && specText.includes('generated/vcm/')
  checks.push({
    id: 'VCM-THREE-LAYER-SPEC',
    title: 'VCM_NATIVE_CLASS_SPEC 声明结构/语义/缓存三层真源',
    status: threeLayerOk ? 'pass' : 'regression',
    evidence: threeLayerOk ? SPEC_REF : 'missing three-layer section',
  })
  if (!threeLayerOk) regressionCount += 1

  const recoveryPath = path.join(ROOT, 'packages/spark-ai/src/vcm-native/recovery/vcm-failure-mode-recovery.ts')
  const adapterPath = path.join(ROOT, 'packages/spark-ai/src/agent/business/vcm-native-agent-adapter.ts')
  const recoveryWired = fs.readFileSync(recoveryPath, 'utf8').includes('collectVcmFailureModeRecoveryHints')
    && fs.readFileSync(adapterPath, 'utf8').includes('collectVcmFailureModeRecoveryHints')
    && !fs.existsSync(path.join(ROOT, 'packages/spark-ai/src/vcm-native/recovery/class-model-knowledge-index.ts'))
  checks.push({
    id: 'VCM-RECOVERY-FAILURE-MODE-ONLY',
    title: 'recovery 只读 metadata @failureMode，不遍历 ClassModel 图',
    status: recoveryWired ? 'pass' : 'regression',
    evidence: recoveryWired ? 'vcm-failure-mode-recovery.ts + vcm-native-agent-adapter.ts' : 'recovery 旁路或未接线',
  })
  if (!recoveryWired) regressionCount += 1

  const workerText = fs.readFileSync(
    path.join(ROOT, 'packages/spark-ai/src/vcm-native/knowledge/worker-knowledge-handler.ts'),
    'utf8',
  )
  const catalogFailFast = workerText.includes('Failed to load component catalog')
    && !workerText.includes('if (!response.ok) return this.baseProvider')
  checks.push({
    id: 'VCM-WORKER-CATALOG-FAIL-FAST',
    title: 'Worker component catalog 拉取失败时 fail-fast（methodGuide + componentType）',
    status: catalogFailFast ? 'pass' : 'regression',
    evidence: catalogFailFast ? 'worker-knowledge-handler.ts' : 'catalog 仍静默回退',
  })
  if (!catalogFailFast) regressionCount += 1

  const legacyDirs = ['generated/vcm/dist/project-model', 'generated/vcm/dist/project-page-surface']
  const legacyHits = legacyDirs.filter(rel => fs.existsSync(path.join(ROOT, rel)))
  const legacyOk = legacyHits.length === 0
  checks.push({
    id: 'VCM-NO-LEGACY-DIST',
    title: '无 generated/vcm/dist/<id>/ 遗留产物（canonical 为 generated/vcm/<id>/）',
    status: legacyOk ? 'pass' : 'regression',
    evidence: legacyOk ? 'no legacy dirs' : legacyHits,
  })
  if (!legacyOk) regressionCount += 1

  const artifacts = {}
  for (const target of DIST_TARGETS) {
    artifacts[target.id] = {
      runtime: readJson(target.runtime),
      compileReport: readJson(target.compileReport),
      manifest: readJson(target.manifest),
    }
  }

  const gatesOk = DIST_TARGETS.every((target) => {
    const gates = artifacts[target.id].compileReport?.gates
    if (gates === undefined) return false
    return gates.diagnosticErrorCount === 0
      && gates.lifecycleErrorCount === 0
      && gates.jsdocSourceTodoCount === 0
      && gates.schemaSourceTodoCount === 0
  })
  checks.push({
    id: 'VCM-COMPILE-GATES-ZERO',
    title: '单 target compile-report gates 全 0',
    status: gatesOk ? 'pass' : 'regression',
    evidence: DIST_TARGETS.map(target => ({
      targetId: target.id,
      gates: artifacts[target.id].compileReport?.gates ?? null,
    })),
  })
  if (!gatesOk) regressionCount += 1

  const surfaceModule = loadModule(artifacts['project-page-surface'].runtime)
  const failureModeHits = []
  for (const required of REQUIRED_FAILURE_MODES) {
    const api = resolveApi(surfaceModule, required.className)
    const codes = listActionFailureCodes(api, required.action)
    if (!codes.includes(required.code)) {
      failureModeHits.push({ ...required, codes })
    }
  }
  const failureModesOk = failureModeHits.length === 0
  checks.push({
    id: 'VCM-KEY-FAILURE-MODES',
    title: 'domain 栈关键 action @failureMode（当前无强制项）',
    status: failureModesOk ? 'pass' : 'regression',
    evidence: failureModesOk ? REQUIRED_FAILURE_MODES : failureModeHits,
  })
  if (!failureModesOk) regressionCount += 1

  const rootParityOk = surfaceModule?.rootApi?.className === 'ProjectRootModel'
  checks.push({
    id: 'VCM-DOMAIN-ROOT-CLASS',
    title: 'project-page-surface rootApi.className 为 ProjectRootModel',
    status: rootParityOk ? 'pass' : 'regression',
    evidence: rootParityOk ? 'ProjectRootModel' : surfaceModule?.rootApi?.className ?? 'missing',
  })
  if (!rootParityOk) regressionCount += 1

  const surfaceManifest = artifacts['project-page-surface'].manifest
  const manifestKinds = surfaceManifest === undefined
    ? []
    : collectReachableKindsFromManifest(surfaceManifest)
  const manifestKindsOk = EXPECTED_REACHABLE_KINDS.every(kind => manifestKinds.includes(kind))
  checks.push({
    id: 'VCM-MANIFEST-KIND-CLOSURE',
    title: 'project-page-surface manifest 覆盖 domain 属性链 className',
    status: manifestKindsOk ? 'pass' : 'regression',
    evidence: { expected: EXPECTED_REACHABLE_KINDS, actual: manifestKinds },
  })
  if (!manifestKindsOk) regressionCount += 1

  const classModelTypes = fs.readFileSync(
    path.join(ROOT, 'packages/spark-ai/src/vcm-native/class-model/types.ts'),
    'utf8',
  )
  const classModelPure = !classModelTypes.includes('diagnostics:')
    && !classModelTypes.includes('models:')
    && !classModelTypes.includes('returnsKind')
    && !classModelTypes.includes('callbackTargetKind')
  checks.push({
    id: 'VCM-CLASSMODEL-PURE-INDEX',
    title: 'ClassModel 无第二知识通道（models/diagnostics/returnsKind）',
    status: classModelPure ? 'pass' : 'regression',
    evidence: classModelPure ? 'class-model/types.ts' : 'forbidden fields still present',
  })
  if (!classModelPure) regressionCount += 1

  const commands = []
  commands.push(runCommand('audit:vcm-build-output', 'node', ['--import', 'tsx', 'scripts/audit-vcm-build-output.mjs']))
  if (commands.at(-1).exitCode !== 0) regressionCount += 1

  commands.push(runCommand('vitest-vcm-chain', 'pnpm', ['exec', 'vitest', 'run', ...VITEST_FILES]))
  if (commands.at(-1).exitCode !== 0) regressionCount += 1

  const snapshot = {
    generatedAt,
    headCommit,
    specRef: SPEC_REF,
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
      threeLayerSpecDocumented: threeLayerOk,
      recoveryFailureModeOnly: recoveryWired,
      workerCatalogFailFast: catalogFailFast,
      compileGatesZero: gatesOk,
      keyFailureModesPresent: failureModesOk,
      crossTargetRootParity: rootParityOk,
      manifestKindClosure: manifestKindsOk,
      auditAndVitestGreen: commands.every(item => item.exitCode === 0),
    },
  }

  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true })
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')

  console.log('VCM full-chain reconciliation')
  console.log(`  head: ${headCommit}`)
  console.log(`  snapshot: ${path.relative(ROOT, SNAPSHOT_PATH)}`)
  for (const check of checks) {
    console.log(`  [${check.status}] ${check.id}: ${check.title}`)
  }
  for (const cmd of commands) {
    console.log(`  [${cmd.exitCode === 0 ? 'pass' : 'fail'}] ${cmd.label} (exit ${cmd.exitCode})`)
  }
  console.log(regressionCount === 0
    ? '\nVCM full-chain reconciliation: no regression.'
    : `\nRegression count: ${regressionCount}`)

  process.exit(regressionCount === 0 ? 0 : 1)
}

main()
