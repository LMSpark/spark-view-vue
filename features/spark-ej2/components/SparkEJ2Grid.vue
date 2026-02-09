<template>
  <component :is="activeComponent" v-bind="gridProps">
    <!-- render spark child components (columns) inside the active grid/placeholder -->
    <component
      v-for="(child, index) in config.children || []"
      :is="getComponent(child.type)"
      :key="`column-${index}`"
      :config="child"
      :parent-context="context"
    />
  </component>
</template>

<script setup lang="ts">
import { computed, ref, defineComponent, onMounted, h, type Component } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { GRID_INSTANCE, DATA_SOURCE, COLUMN_MANAGER } from '@spark-view/spark-utils'
import type { SparkEJ2GridConfig } from '../types'

// 组件 Props
interface Props {
  config: SparkEJ2GridConfig
}

const props = defineProps<Props>()

// 使用 SPARK 组合式函数
const {
  context,
  provide,
  logger,
  getComponent
} = useSparkComponent(props.config)

// 网格配置（移除children属性，保留EJ2原生属性）
const gridProps = computed(() => {
  const { children: _children, ...config } = props.config
  return config
})

// 统一占位组件（始终可用，避免缺失 render 报错）
const PlaceholderGrid = defineComponent({
  name: 'PlaceholderGrid',
  props: ['class', 'style'],
  setup(_, { slots }) {
    return () => {
      const slotContent = slots['default'] ? slots['default']() : []
      return h('div', { class: 'ej2-grid-placeholder' }, slotContent)
    }
  }
})

import { markRaw } from 'vue'

// activeComponent 初始为占位组件（markRaw 避免被 reactive 包装）
const activeComponent = ref<Component>(markRaw(PlaceholderGrid))

// 尝试按需加载 EJ2 Grid（非强制），加载失败则保持占位组件
import('@syncfusion/ej2-vue-grids')
  .then((m: Record<string, unknown>) => {
    if (m && m.GridComponent) {
      activeComponent.value = markRaw(m.GridComponent as Component)
    }
  })
  .catch(e => {
    logger.info('EJ2 Grid not available, using placeholder', String(e))
  })

import('@syncfusion/ej2-grids')
  .then(m => { if (m && m.Grid && m.Page) m.Grid.Inject(m.Page) })
  .catch(() => {})

// 注册网格相关能力
const registerGridCapabilities = () => {
  provide(GRID_INSTANCE, { instance: null })
  provide(DATA_SOURCE, { getData: () => props.config.dataSource })
  provide(COLUMN_MANAGER, {
    addColumn: (column: Record<string, unknown>) => { logger.info('Adding column:', column) },
    removeColumn: (field: string) => { logger.info('Removing column:', field) },
    getColumns: () => props.config.children || []
  })
  logger.info('🎯 SPARK EJ2 Grid capabilities registered')
}

registerGridCapabilities()

onMounted(() => {
  logger.info('🎯 SPARK EJ2 Grid mounted with config:', props.config)
})
</script>

<style scoped>
/* SPARK EJ2 Grid 样式 */
.ej2-grid-placeholder { border: 1px dashed #ccc; padding: 8px; }
</style>