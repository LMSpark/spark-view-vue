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
import FieldTextComp from './renderer-fields/FieldText.vue'
import FieldNumberComp from './renderer-fields/FieldNumber.vue'
import FieldDateComp from './renderer-fields/FieldDate.vue'
export { FieldTextComp as FieldText }
export { FieldNumberComp as FieldNumber }
export { FieldDateComp as FieldDate }

// ── SPARK 注册 ──

// 容器组件：懒加载（体积大，不一定全部使用）
const containerReg = Spark.createRegister(
  import.meta.glob('./renderer-containers/*.vue') as GlobModules
)
containerReg.registerAll({
  'r-table':  './renderer-containers/RendererTable.vue',
  'r-form':   './renderer-containers/RendererForm.vue',
  'r-detail': './renderer-containers/RendererDetail.vue',
  'r-tree':   './renderer-containers/RendererTree.vue',
})

// 字段组件：同步注册（体积小，且 el-table 要求 el-table-column 同步就绪）
// 避免 defineAsyncComponent 导致 el-table 初次渲染时找不到 el-table-column
Spark.register('r-text', FieldTextComp)
Spark.register('r-number', FieldNumberComp)
Spark.register('r-date', FieldDateComp)
