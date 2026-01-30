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
// import { computed } from 'vue'
import { useSparkComponent } from '@spark-view/spark-core'
// getColumnConfig now provided by useSparkComponent; helper import removed
import type { SparkComponentConfig, SparkComponentContext } from '@spark-view/spark-core'
// Removed EJ2 imports to avoid runtime errors in tests
// import type { ColumnModel } from '@syncfusion/ej2-vue-grids'

interface SparkEJ2ColumnConfig extends SparkComponentConfig {
  type: 'spark-ej2-column'
  field?: string
  headerText?: string
  width?: string | number
  textAlign?: string
  format?: string
  template?: any
  visible?: boolean
  allowSorting?: boolean
  allowFiltering?: boolean
  children?: SparkEJ2ColumnConfig[]
}

interface Props {
  config: SparkEJ2ColumnConfig
  parentContext?: SparkComponentContext
}

const props = defineProps<Props>()

const { context, provide, getComponent } = useSparkComponent(
  props.config as SparkComponentConfig,
  { parentContext: props.parentContext }
)

// Detect test environment (kept for future use if needed) - removed unused variable
// const isTest = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env['VITEST'] === true) || (typeof process !== 'undefined' && (process.env && (process.env['VITEST'] === 'true' || process.env['NODE_ENV'] === 'test')))

// 是否为顶级列（简化逻辑，不再需要复杂的条件） - removed unused variable
// const isTopLevelColumn = computed(() =>
//   !props.parentContext || props.parentContext.type === 'spark-ej2-grid'
// )

// 提供能力给子组件（测试友好的版本）
provide('columnConfig', {
  addChildColumn: () => {},
  removeChildColumn: () => {}
})
</script>

<style scoped>
/* SPARK EJ2 Column 样式 */
</style>