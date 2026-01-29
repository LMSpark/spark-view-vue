<template>
  <ejs-grid
    ref="gridRef"
    v-bind="gridProps"
  >
    <e-columns>
      <!-- 直接渲染 children 作为列 -->
      <component
        :is="getSparkComponent(child.type)"
        v-for="(child, index) in config.children"
        :key="`column-${index}`"
        :config="child"
        :parent-context="context"
      />
    </e-columns>
  </ejs-grid>
</template>

<script setup lang="ts">
import { computed, onMounted, provide, ref } from 'vue'
import { GridComponent as EjsGrid, ColumnsDirective as EColumns } from '@syncfusion/ej2-vue-grids'
import { useSparkComponent } from '@spark-view/spark-core'
import type { SparkEJ2GridConfig } from '@spark-view/spark-core'

// 组件 Props
interface Props {
  config: SparkEJ2GridConfig
}

const props = defineProps<Props>()

// 使用 SPARK 组合式函数
const {
  context,
  registerProvider,
  componentClass: _componentClass,
  componentStyle: _componentStyle,
  logger,
  getSparkComponent
} = useSparkComponent({ config: props.config })

// Grid 引用
const gridRef = ref<EjsGrid>()

// 计算网格属性
const gridProps = computed(() => {
  const { columns: _columns, slots: _slots, type: _type, children: _children, ...gridConfig } = props.config
  return gridConfig
})

// 注册网格能力
const registerGridCapabilities = () => {
  // 注册网格实例能力（传入 ref，以便在未 mount 时也能被引用）
  registerProvider('gridInstance', gridRef)

  // 注册数据源管理能力
  registerProvider('dataSource', {
    getData: () => props.config.dataSource,
    setData: (data: any[]) => {
      if (gridRef.value) {
        ;(gridRef.value as any).dataSource = data
      }
    }
  })

  // 注册列管理能力
  registerProvider('columnManager', {
    addColumn: (column: any) => {
      logger.info('Adding column:', column)
    },
    removeColumn: (field: string) => {
      logger.info('Removing column:', field)
    },
    getColumns: () => props.config.children || []
  })

  logger.info('🎯 SPARK EJ2 Grid capabilities registered')
}

// 立即注册（避免子组件在父 onMounted 之前消费能力时找不到）
registerGridCapabilities()

// 组件挂载
onMounted(() => {
  logger.info('🎯 SPARK EJ2 Grid mounted with config:', props.config)
})

// 提供网格实例给子组件
provide('ejsGridInstance', gridRef)
</script>

<style scoped>
/* SPARK EJ2 Grid 样式 */
</style>