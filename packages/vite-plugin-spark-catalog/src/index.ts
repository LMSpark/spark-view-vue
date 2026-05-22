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
