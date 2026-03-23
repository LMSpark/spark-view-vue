/**
 * Vitest setup —— 配置 DataView.wrapInstance 为 Vue shallowReactive
 *
 * spark-component 测试使用 Vue 组件挂载，需要 DataView 实例是响应式的（与生产 plugin.ts 一致）。
 */
import { shallowReactive } from 'vue'
import { DataView } from '@spark-view/spark-data'

DataView.wrapInstance = (dv) => shallowReactive(dv) as DataView
