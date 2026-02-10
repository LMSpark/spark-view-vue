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
/**
 * SPARK EJ2 Grid 组件 - Syncfusion Grid 集成
 * 
 * @component SparkEJ2Grid
 * @description
 * 基于 Syncfusion EJ2 Grid 的 SPARK 网格组件，支持动态列配置、数据绑定和能力提供。
 * 采用按需加载策略，在 EJ2 库不可用时自动降级到占位组件，保证系统稳定运行。
 * 
 * 核心特性：
 * 1. **按需加载**：动态导入 EJ2 库，减小首屏体积
 * 2. **优雅降级**：库加载失败时使用占位组件，不影响开发和测试
 * 3. **能力提供**：提供 GRID_INSTANCE、DATA_SOURCE、COLUMN_MANAGER 能力
 * 4. **递归渲染**：自动渲染子列组件（SparkEJ2Column）
 * 5. **配置驱动**：支持 EJ2 原生配置和 SPARK 扩展配置
 * 
 * @example
 * ```vue
 * <SparkEJ2Grid
 *   :config="{
 *     type: 'spark-ej2-grid',
 *     id: 'user-grid',
 *     dataSource: users,
 *     allowPaging: true,
 *     pageSettings: { pageSize: 10 },
 *     children: [
 *       { type: 'spark-ej2-column', field: 'name', headerText: '姓名' },
 *       { type: 'spark-ej2-column', field: 'email', headerText: '邮箱' }
 *     ]
 *   }"
 * />
 * ```
 * 
 * @author SPARK Team
 * @since 1.0.0
 */
import { computed, ref, defineComponent, onMounted, h, type Component } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { GRID_INSTANCE, DATA_SOURCE, COLUMN_MANAGER } from '@spark-view/spark-utils'
import type { SparkEJ2GridConfig } from '../types'

/**
 * 组件属性定义
 */
interface Props {
  /**
   * EJ2 Grid 配置对象
   * 包含 EJ2 原生属性（dataSource, allowPaging 等）和 SPARK 扩展属性（children）
   * @example
   * {
   *   type: 'spark-ej2-grid',
   *   dataSource: [...],
   *   allowPaging: true,
   *   pageSettings: { pageSize: 20 },
   *   children: [{ type: 'spark-ej2-column', field: 'id' }]
   * }
   */
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