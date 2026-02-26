/**
 * Renderer 组件导出 + SPARK 注册
 *
 * 容器组件 type 映射（JSON 配置驱动）：
 *   r-table  → RendererTable
 *   r-form   → RendererForm
 *   r-detail → RendererDetail
 *   r-tree   → RendererTree
 *
 * 字段组件 type 映射（SPARK 与 Vue 全局保持一致）：
 *   r-text   → FieldText
 *   r-number → FieldNumber
 *   r-date   → FieldDate
 */
import { Spark } from '@spark-view/spark-component'
import type { GlobModules } from '@spark-view/spark-component'

// 容器组件
export { default as RendererTable } from './renderer-containers/RendererTable.vue'
export { default as RendererForm } from './renderer-containers/RendererForm.vue'
export { default as RendererDetail } from './renderer-containers/RendererDetail.vue'
export { default as RendererTree } from './renderer-containers/RendererTree.vue'

// 字段组件
export { default as FieldText } from './renderer-fields/FieldText.vue'
export { default as FieldNumber } from './renderer-fields/FieldNumber.vue'
export { default as FieldDate } from './renderer-fields/FieldDate.vue'

// ── SPARK 注册（懒加载，Vite 代码分割）──

const containerReg = Spark.createRegister(
  import.meta.glob('./renderer-containers/*.vue') as GlobModules
)
containerReg.registerAll({
  'r-table':  './renderer-containers/RendererTable.vue',
  'r-form':   './renderer-containers/RendererForm.vue',
  'r-detail': './renderer-containers/RendererDetail.vue',
  'r-tree':   './renderer-containers/RendererTree.vue',
})

const fieldReg = Spark.createRegister(
  import.meta.glob('./renderer-fields/*.vue') as GlobModules
)
// 使用与 Vue 全局注册一致的 type 名（r-text / r-number / r-date），
// 保证 JSON 配置与模板直接使用时的 type 名统一
fieldReg.registerAll({
  'r-text':   './renderer-fields/FieldText.vue',
  'r-number': './renderer-fields/FieldNumber.vue',
  'r-date':   './renderer-fields/FieldDate.vue',
})
