/**
 * SPARK 组件目录生成 Vite 插件
 *
 * 构建时通过 vue-component-meta 从 Vue SFC 提取完整的 Props/Emits 类型，
 * 生成单一 component-catalog.json（原版 VCM 输出）。
 *
 * @module @spark-view/vite-plugin-spark-catalog
 */

// ── 插件入口 ──
export { sparkCatalogPlugin } from './plugin'
export type { SparkCatalogPluginOptions } from './plugin'

// ── VCM 提取引擎（vue-component-meta，完整类型解析） ──
export {
  getOrCreateChecker,
  resetChecker,
  extractComponentApiVcm,
  extractAllComponentApisVcm,
} from './extract-component-api-vcm'
export type { VcmApiDescriptor, ExtractComponentApiVcmOptions, VcmCheckerOptions } from './extract-component-api-vcm'

// ── JSON 目录生成器 ──
export { generateJsonCatalog } from './json-catalog-generator'
export type { JsonCatalogOptions } from './json-catalog-generator'

// ── JSON Schema 类型 ──
export type {
  ComponentCatalog,
  ComponentRegistry,
  ComponentEntry,
  ComponentContractRefs,
  CatalogCanonicalModel,
  CatalogCanonicalDictionaries,
  CatalogCanonicalComponent,
  PropEntry,
  EmitEntry,
  PropSchema,
  RootFieldEntry,
  PlatformConstraints,
  NestingRule,
  CatalogBindingDescriptor,
  CatalogGovernance,
  GovernanceContract,
  ApiSurface,
  ApiMethodEntry,
  ApiParamEntry,
  ApiMemberEntry,
} from './component-catalog-schema'

// ── 工具函数（供主注册插件复用） ──
export {
  toKebabCase,
  normalizePath,
  inferSkillType,
  buildImplicitSkillDescription,
  parseSkillMeta,
} from './utils'
export type { SkillMeta } from './utils'

// ── 扫描配置（统一 glob / 加载策略常量） ──
export {
  COMPONENT_SCAN_PATTERNS,
  COMPONENT_EXCLUDE_PATTERNS,
  CATALOG_FEATURE_EXCLUDE_PATTERNS,
  SYNC_COMPONENTS,
  ASYNC_COMPONENTS,
  SIZE_THRESHOLD,
} from './scan-config'
