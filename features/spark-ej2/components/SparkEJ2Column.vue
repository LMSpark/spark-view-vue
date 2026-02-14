<template>
  <!-- Always render lightweight placeholder to avoid EJ2 runtime errors in all environments -->
  <!-- SPARK contexts and providers are still created for testing and functionality -->
  <div class="spark-ej2-column-placeholder">
    <div class="column-header">{{ config.headerText || config.field }}</div>
    <div v-if="config.children" class="column-children">
      <component
        :is="getComponent(child.type || 'spark-ej2-column')"
        v-for="(child, index) in config.children"
        :key="`subcolumn-${index}`"
        :config="child"
        :parent-context="context"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SPARK EJ2 Column 组件 - Grid 列配置
 * 
 * @component SparkEJ2Column
 * @description
 * Syncfusion EJ2 Grid 的列配置组件，支持列嵌套和递归渲染。
 * 使用轻量级占位符渲染，避免 EJ2 运行时错误，同时保持 SPARK 能力系统完整功能。
 * 
 * 核心特性：
 * 1. **占位符渲染**：避免 EJ2 环境依赖，支持独立测试
 * 2. **列嵌套**：支持多级列头（children 配置）
 * 3. **能力提供**：提供 COLUMN_CONFIG 能力给子列
 * 4. **配置驱动**：支持 EJ2 原生列配置（field, headerText, width 等）
 * 5. **递归渲染**：自动渲染子列组件
 * 
 * @example
 * ```vue
 * <SparkEJ2Column
 *   :config="{
 *     type: 'spark-ej2-column',
 *     field: 'name',
 *     headerText: '用户姓名',
 *     width: 120,
 *     children: [
 *       { type: 'spark-ej2-column', field: 'firstName', headerText: '名' },
 *       { type: 'spark-ej2-column', field: 'lastName', headerText: '姓' }
 *     ]
 *   }"
 * />
 * ```
 * 
 * @author SPARK Team
 * @since 1.0.0
 */
import { useSparkComponent } from '@spark-view/spark-component'
import type { ComponentContext } from '@spark-view/spark-component'
import { COLUMN_CONFIG } from '@spark-view/spark-utils'
import type { SparkEJ2ColumnConfig } from '../types'

/**
 * 组件属性定义
 */
interface Props {
  /**
   * EJ2 列配置对象
   * 支持 EJ2 原生列属性和 SPARK 扩展（children）
   * @example
   * {
   *   field: 'email',
   *   headerText: '邮箱地址',
   *   width: 200,
   *   format: 'C2',
   *   textAlign: 'Right'
   * }
   */
  config: SparkEJ2ColumnConfig
  
  /**
   * 父组件上下文（可选）
   * 用于列嵌套时的上下文传递
   * @default undefined
   */
  parentContext?: ComponentContext
}

const props = defineProps<Props>()

const { context, provide, getComponent } = useSparkComponent(
  props.config,
  props.parentContext ? { parentContext: props.parentContext } : {}
)

// 提供能力给子组件
provide(COLUMN_CONFIG, {
  addChildColumn: () => {},
  removeChildColumn: () => {}
})
</script>

<style scoped>
/* SPARK EJ2 Column 样式 */
</style>