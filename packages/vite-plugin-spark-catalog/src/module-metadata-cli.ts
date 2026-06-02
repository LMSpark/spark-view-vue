#!/usr/bin/env node
/**
 * 独立 AI 能力模块元数据生成命令。
 *
 * 用法：
 *   pnpm run generate:module-metadata
 */
import { resolve } from 'node:path'
import { generateModuleAbilityMetadata } from './module-metadata-generator'
import { createLogger } from './utils'

const logger = createLogger('module-metadata-cli')
const root = resolve(import.meta.dirname, '../../..')
const diagnoseOnly = process.argv.includes('--diagnose-only')
const trace = process.argv.includes('--trace')
const extractResults = process.argv.includes('--extract-results')
const extractResultSchemas = process.argv.includes('--extract-result-schemas')

const PAGE_DESIGN_MODULE_METADATA_SOURCES = [
  'packages/spark-data/src/dataset-crud-tool.ts',
] as const

const PAGE_DESIGN_MODULE_METADATA_OUT_FILE =
  'packages/spark-project-model/src/ai/page-design/page-design-ability-metadata.generated.json'

const PAGE_DESIGN_API_OBJECT_METADATA_OUT_FILE =
  'packages/spark-project-model/src/ai/page-design/page-design-module-metadata.generated.json'

logger.info(diagnoseOnly ? '🚀 开始诊断 AI 能力模块元数据 ...' : '🚀 开始生成 AI 能力模块元数据 ...')
const result = generateModuleAbilityMetadata(root, {
  sources: PAGE_DESIGN_MODULE_METADATA_SOURCES,
  outFile: PAGE_DESIGN_MODULE_METADATA_OUT_FILE,
  moduleOutFile: PAGE_DESIGN_API_OBJECT_METADATA_OUT_FILE,
  trace,
  extractResults,
  extractResultSchemas,
  writeFiles: !diagnoseOnly,
})
if (diagnoseOnly) {
  logger.info(`✅ 已完成元数据提取诊断；未写入 generated JSON。abilityOutput=${result.outFile}`)
} else {
  logger.info(`✅ ${result.abilities.length} 个能力模块元数据已写入 ${result.outFile}`)
  logger.info(`✅ ${result.diagnostics.moduleCount} 个 API object metadata 已写入 ${result.moduleOutFile}`)
}
logger.info([
  '📊 metadata diagnostics:',
  `abilities=${String(result.diagnostics.abilityCount)}`,
  `modules=${String(result.diagnostics.moduleCount)}`,
  `actions=${String(result.diagnostics.actionCount)}`,
  `resultApis=${String(result.diagnostics.resultApiCount)}`,
  `referencedApiKinds=${result.diagnostics.referencedApiKinds.length === 0 ? '(none)' : result.diagnostics.referencedApiKinds.join(',')}`,
  `emptySchemaNodes=${String(result.diagnostics.emptySchemaNodeCount)}`,
  `maxSchemaDepth=${String(result.diagnostics.maxSchemaDepth)}`,
].join(' '))

for (const module of result.diagnostics.modules) {
  logger.info(
    `  - ${module.kind}: actions=${String(module.actionCount)}, directResultApis=${module.directResultApiKinds.length === 0 ? '(none)' : module.directResultApiKinds.join(',')}, resultApis=${String(module.resultApiCount)}, emptySchemaNodes=${String(module.emptySchemaNodeCount)}`,
  )
}

for (const finding of result.diagnostics.findings) {
  const suffix = finding.fix === undefined ? '' : ` fix=${finding.fix}`
  logger.info(`  [${finding.level}] ${finding.rule} ${finding.target}: ${finding.message}${suffix}`)
}
