/**
 * SPARK 组件 Props 目录生成 Vite 插件
 *
 * 构建时从 Vue SFC 源码提取 Props JSDoc，与手工补充数据合并，
 * 生成 component-props-catalog.ts 和 component-catalog.json 供 AI 管线消费。
 *
 * @module @spark-view/vite-plugin-spark-catalog
 */

// ── 插件入口 ──
export { sparkCatalogPlugin } from './plugin'
export type { SparkCatalogPluginOptions } from './plugin'

// ── AST 提取引擎（供其他构建工具复用） ──
export { extractComponentApi, extractAllComponentApis } from './extract-component-api'
export type { ComponentApiDescriptor, PropDescriptor, EmitDescriptor } from './extract-component-api'

// ── 补充数据 ──
export {
  CATALOG_OVERRIDES,
  CATALOG_ADDENDUMS,
  COMPONENT_CATEGORIES,
} from './supplement'
export type { ComponentCategory } from './supplement'

// ── JSON 目录生成器（SSoT） ──
export { generateJsonCatalog } from './json-catalog-generator'
export type { JsonCatalogOptions } from './json-catalog-generator'

// ── JSON Schema 类型 ──
export type {
  ComponentCatalog,
  ComponentRegistry,
  ComponentEntry,
  PropEntry,
  EmitEntry,
  CapabilityInfo,
  RootFieldEntry,
  PlatformConstraints,
  NestingRule,
} from './component-catalog-schema'

// ── 提示词生成器（JSON → prompt text） ──
export {
  generateRegistryPrompt,
  generateComponentPrompt,
  generatePropsCatalogPrompt,
  queryComponentProps,
  generateLegacyCatalogRecord,
} from './prompt-generator'
export type { PromptGeneratorOptions, PromptVerbosity } from './prompt-generator'

// ── 校验器（JSON → 校验报告） ──
export { validateWithCatalog } from './catalog-validator'
export type {
  ConfigValidationReport,
  ConfigValidationIssue,
  ConfigValidationSummary,
  ConfigValidationCategory,
  ConfigValidationSeverity,
  GeneratedPageFiles,
} from './catalog-validator'

// ── 工具函数（供主注册插件复用） ──
export {
  toKebabCase,
  normalizePath,
  inferSkillType,
  buildImplicitSkillDescription,
  parseSkillMeta,
} from './utils'
export type { SkillMeta } from './utils'
