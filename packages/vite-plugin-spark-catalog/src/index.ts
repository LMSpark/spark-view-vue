/**
 * SPARK 组件目录生成 Vite 插件
 *
 * dev/build 时通过 vue-component-meta 从 Vue SFC 提取 Props/Emits，
 * 写入 tmp/component-catalog.json 作为 VCM 诊断产物。
 * pageDesign LLM 主路径使用 module-metadata 生成物 + AiModuleAdapter。
 *
 * @module @spark-appworks/vite-plugin-spark-catalog
 */

// ── 插件入口 ──
export { sparkCatalogPlugin } from './plugin'
export type { SparkCatalogPluginOptions } from './plugin'
