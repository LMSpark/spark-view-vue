/**
 * Vitest setup —— 配置 DataView.wrapInstance 为 Vue reactive
 *
 * spark-component 测试使用 Vue 组件挂载，需要 DataView 实例是响应式的。
 */
import { reactive } from 'vue'
import { DataView } from '@spark-view/spark-data'

DataView.wrapInstance = (dv) => reactive(dv) as DataView
