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
import { useSparkComponent } from '@spark-view/spark-component'
import type { ComponentContext } from '@spark-view/spark-component'
import type { SparkEJ2ColumnConfig } from '../types'

interface Props {
  config: SparkEJ2ColumnConfig
  parentContext?: ComponentContext
}

const props = defineProps<Props>()

const { context, provide, getComponent } = useSparkComponent(
  props.config,
  { parentContext: props.parentContext }
)

// 提供能力给子组件
provide('columnConfig', {
  addChildColumn: () => {},
  removeChildColumn: () => {}
})
</script>

<style scoped>
/* SPARK EJ2 Column 样式 */
</style>