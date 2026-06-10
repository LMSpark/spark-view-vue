/**
 * VCM 编译报告：把 generator 诊断、todo 日志与 bundle 摘要写入 dist，供门禁与 IDE 读取。
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type {
  ModuleMetadataDiagnosticFinding,
  ModuleMetadataGenerationResult,
  ModuleMetadataRuntimeAudit,
} from './module-metadata-generator'
import type { VcmBundleWriteResult } from './vcm-bundle-writer'

export const VCM_COMPILE_REPORT_PROTOCOL = 'spark-appworks.vcm.compile-report'
export const VCM_COMPILE_REPORT_SCHEMA_VERSION = 1

export type VcmCompileReport = Readonly<{
  protocol: typeof VCM_COMPILE_REPORT_PROTOCOL
  schemaVersion: typeof VCM_COMPILE_REPORT_SCHEMA_VERSION
  targetId: string
  generatedAt: string
  generatedBy: string
  distDir: string
  gates: Readonly<{
    diagnosticErrorCount: number
    diagnosticWarnCount: number
    jsdocSourceTodoCount: number
    schemaSourceTodoCount: number
    lifecycleErrorCount: number
  }>
  coverage: Readonly<{
    attributes: string
    methodParams: string
    methodReturns: string
    resultApiMethods: number
    schemaDescriptions: string
    defs: number
    missingDefRefs: number
    deadDefs: number
  }>
  bundle?: Readonly<{
    manifestFile: string
    defsFile: string
    kindFiles: readonly string[]
    assembledRuntimeFile: string
  }>
  findings: readonly ModuleMetadataDiagnosticFinding[]
}>

export function buildVcmCompileReport(command: Readonly<{
  targetId: string
  distDir: string
  result: ModuleMetadataGenerationResult
  runtimeAudit: ModuleMetadataRuntimeAudit
  lifecycleFindings: readonly ModuleMetadataDiagnosticFinding[]
  bundle?: VcmBundleWriteResult
  jsdocSourceTodoCount: number
  schemaSourceTodoCount: number
}>): VcmCompileReport {
  // diagnostics.findings 已含 lifecycle 审计；勿与 lifecycleFindings 二次合并。
  const allFindings = command.result.diagnostics.findings
  const diagnosticErrorCount = allFindings.filter(item => item.level === 'error').length
  const diagnosticWarnCount = allFindings.filter(item => item.level === 'warn').length
  const lifecycleErrorCount = allFindings.filter(
    item => item.level === 'error' && item.rule.startsWith('lifecycle-'),
  ).length
  const coverage = command.runtimeAudit.knowledgeReadiness.coverage
  const schemaRefAudit = command.runtimeAudit.schemaRefAudit

  return {
    protocol: VCM_COMPILE_REPORT_PROTOCOL,
    schemaVersion: VCM_COMPILE_REPORT_SCHEMA_VERSION,
    targetId: command.targetId,
    generatedAt: new Date().toISOString(),
    generatedBy: 'packages/vite-plugin-spark-catalog/src/module-metadata-cli.ts',
    distDir: command.distDir,
    gates: {
      diagnosticErrorCount,
      diagnosticWarnCount,
      jsdocSourceTodoCount: command.jsdocSourceTodoCount,
      schemaSourceTodoCount: command.schemaSourceTodoCount,
      lifecycleErrorCount,
    },
    coverage: {
      attributes: `${String(coverage.typedAttributeCount)}/${String(coverage.attributeCount)}`,
      methodParams: `${String(coverage.typedMethodParamCount)}/${String(coverage.methodCount)}`,
      methodReturns: `${String(coverage.methodReturnKnowledgeCount)}/${String(coverage.methodCount)}`,
      resultApiMethods: coverage.resultApiMethodCount,
      schemaDescriptions: `${String(coverage.schemaPropertyDescriptionCount)}/${String(coverage.schemaPropertyCount)}`,
      defs: schemaRefAudit.defs,
      missingDefRefs: schemaRefAudit.missingDefRefs.length,
      deadDefs: schemaRefAudit.deadDefs.length,
    },
    ...(command.bundle === undefined
      ? {}
      : {
          bundle: {
            manifestFile: command.bundle.manifestFile,
            defsFile: command.bundle.defsFile,
            kindFiles: command.bundle.kindFiles,
            assembledRuntimeFile: command.bundle.assembledRuntimeFile,
          },
        }),
    findings: allFindings,
  }
}

export function writeVcmCompileReport(distDir: string, report: VcmCompileReport): string {
  const fileName = 'vcm-compile-report.json'
  writeFileSync(join(distDir, fileName), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return fileName
}
