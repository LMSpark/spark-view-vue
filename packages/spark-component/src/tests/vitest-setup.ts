/**
 * Vitest setup —— 响应式包装由 Vue 集成层（如 usePageDataSet）处理
 *
 * spark-component 测试中，DataView 响应式包装由消费方（如 usePageDataSet）自行处理。
 */
import { defineComponent, h } from 'vue'
import { config } from '@vue/test-utils'
