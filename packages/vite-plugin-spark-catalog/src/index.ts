/**
 * VCM module metadata 生成工具包。
 *
 * 产出 `page-design-module-metadata.*.generated.json`，供 `AiModuleAdapter` 注册 LLM 知识体系。
 *
 * @module @spark-appworks/vite-plugin-spark-catalog
 */

export {
  generateModuleAbilityMetadata,
  generatePageDesignModuleMetadata,
  type ModuleAbilityMetadataGeneratorOptions,
  type ModuleMetadataDiagnosticActionSummary,
  type ModuleMetadataDiagnosticFinding,
  type ModuleMetadataDiagnosticModuleSummary,
  type ModuleMetadataDiagnostics,
  type ModuleMetadataGenerationResult,
} from './module-metadata-generator'
