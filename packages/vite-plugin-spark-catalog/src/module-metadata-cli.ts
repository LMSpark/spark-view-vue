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
  'packages/spark-project-model/src/project/model.ts',
  'packages/spark-project-model/src/page/config-page.ts',
  'packages/spark-data/src/dataset-crud-tool.ts',
  'packages/spark-data/src/node-tree/spark-node-tree.ts',
] as const

const PAGE_DESIGN_MODULE_METADATA_API_ROOTS = ['ProjectModel'] as const

const PAGE_DESIGN_MODEL_METADATA_OUT_FILE =
  'src/services/page-design/page-design-module-metadata.generated.json'

logger.info(diagnoseOnly ? '🚀 开始诊断 AI 能力模块元数据 ...' : '🚀 开始生成 AI 能力模块元数据 ...')
const result = generateModuleAbilityMetadata(root, {
  sources: PAGE_DESIGN_MODULE_METADATA_SOURCES,
  vcmCatalogOutFile: PAGE_DESIGN_MODEL_METADATA_OUT_FILE,
  apiRoots: PAGE_DESIGN_MODULE_METADATA_API_ROOTS,
  trace,
  extractResults,
  extractResultSchemas,
  writeFiles: !diagnoseOnly,
})
if (diagnoseOnly) {
  logger.info(`✅ 已完成元数据提取诊断；未写入 generated JSON。vcmOutput=${result.vcmCatalogOutFile}`)
} else {
  logger.info(`✅ ProjectModel module metadata 已写入 ${result.vcmCatalogOutFile}`)
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
