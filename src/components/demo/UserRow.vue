<template>
  <div 
    v-if="isVisible"
    class="user-row" 
    :class="{ selected: isSelected, 'is-disabled': isDisabled }"
    @click="handleClick"
  >
    <div class="row-checkbox">
      <input 
        type="checkbox" 
        :checked="isSelected"
        @change="handleCheckboxChange"
        @click.stop
      />
    </div>
    
    <!-- 递归渲染子组件 -->
    <component
      v-for="childConfig in childConfigs"
      :key="childConfig.id"
      :is="getComponent(childConfig.type)"
      :config="childConfig"
    />

    <div class="row-level-badge">实例级</div>
  </div>
</template>

<script setup lang="ts">
/**
 * UserRow - 用户行组件
 * 
 * 用于在表格中展示单条用户记录，支持选择、点击交互和子组件渲染。
 * 该组件演示了 SPARK 能力系统的能力提供和消费：
 * - 消费 Grid 层的选择能力（SELECTION）和网格事件（GRID_EVENTS）
 * - 提供行级数据能力（ROW_DATA）和行事件（ROW_EVENTS）给子字段组件
 * 
 * @component UserRow
 * @example
 * ```vue
 * <UserRow 
 *   :config="{
 *     type: 'user-row',
 *     props: { user: { id: 1, name: 'John' } },
 *     children: [
 *       { type: 'user-field', props: { field: 'name' } }
 *     ]
 *   }"
 *   @row-click="handleRowClick"
 * />
 * ```
 * 
 * @author SPARK Team
 * @since v1.0.0
 */
import { ref, computed, onMounted } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { SELECTION, GRID_EVENTS, ROW_DATA, ROW_EVENTS } from '@spark-view/spark-utils'
import { DATA_SOURCE } from '@spark-view/spark-data'
import type { ComponentConfig } from '@spark-view/spark-component'

interface Props {
  /**
   * 组件配置对象，包含用户数据和子组件配置
   * @required
   * @example 
   * {
   *   type: 'user-row',
   *   props: { 
   *     user: { id: 1, name: 'John', email: 'john@example.com' } 
   *   },
   *   children: [
   *     { type: 'user-field', props: { field: 'name' } },
   *     { type: 'user-field', props: { field: 'email' } }
   *   ]
   * }
   */
  config: ComponentConfig
}

const props = defineProps<Props>()

/**
 * 行点击事件
 * @event row-click
 * @param {Record<string, unknown>} user - 被点击的用户数据对象
 */
const emit = defineEmits<{
  'row-click': [user: Record<string, unknown>]
}>()

// ============================================================
// SPARK 组件系统初始化（先于所有业务逻辑）
// ============================================================
const {
  context,
  isVisible,
  isDisabled,
  consume,
  provide: provideCapability,
  provideEvents,
  consumeEvents,
  getComponent,
  logger
} = useSparkComponent(props.config)

// ============================================================
// 数据获取（SOLID 正确姿势：消费父级能力，不依赖 props 注入）
// ============================================================

// 消费父级（UserGrid 或任何提供了 DATA_SOURCE 的组件）的数据源能力
// UserRow 不关心父级是谁，只要能消费到 DATA_SOURCE 就能正常工作
const dataSource = consume(DATA_SOURCE)

// 本行的唯一标识（来自配置，由父级生成 childConfigs 时写入，不携带具体数据）
const rowId = computed(() => props.config.props?.['rowId'] as string | number | undefined)

// 从 DATA_SOURCE 中按 rowId 定位本行数据
// 父级没有注入数据 —— 行组件主动通过能力读取自己的数据
const user = computed(() => {
  const id = rowId.value
  if (id === undefined || id === null) return undefined
  return dataSource?.rows?.find(r => r['id'] === id || r['_id'] === id) as Record<string, unknown> | undefined
})

const childConfigs = computed(() =>
  (props.config.children ?? []).filter(
    (c): c is ComponentConfig => typeof c.type === 'string' && c.type.length > 0
  )
)

// ============ 状态 ============

const isSelected = ref(false)

// ============ 能力消费 ============

// 1. 消费父组件的选择能力
const selection = consume(SELECTION)

// 更新选中状态
const updateSelectionState = () => {
  if (selection && user.value) {
    isSelected.value = selection.isSelected(user.value['id'] as string | number)
  }
}

// 2. 消费父组件的事件能力（使用 consumeEvents 自动注册监听器）
consumeEvents(GRID_EVENTS, {
  'selection:changed': () => {
    updateSelectionState()
    logger.debug('🔄 Selection updated for row:', user.value?.['id'])  },
  'grid:refresh': () => {
    logger.info('📡 Row received grid refresh event')
    // 可以在这里添加刷新逻辑，比如重新获取数据
  },
  'data:refreshed': (data: unknown) => {
    logger.info('📡 Row received data refreshed event:', data)  }
})

// ============ 能力提供（给字段组件） ============

// 提供行数据能力（响应式 - 每次访问时动态获取最新 user）
const rowDataCapability = {
  getData: () => user.value!,
  getField: (field: string) => user.value?.[field],
  isSelected: () => isSelected.value
}

provideCapability(ROW_DATA, rowDataCapability)

// 提供行事件能力（使用真正的事件系统）
const rowEventsEmitter = provideEvents(ROW_EVENTS)

// ============ 事件处理 ============

const handleClick = () => {
  if (!user.value) return
  
  emit('row-click', user.value)
  rowEventsEmitter.emit('row:click', user.value)
}

const handleCheckboxChange = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked
  if (selection && user.value) {
    checked ? selection.select(user.value['id'] as string | number) : selection.deselect(user.value['id'] as string | number)
    updateSelectionState()
  }
}

onMounted(() => {
  updateSelectionState()
  logger.info('🚀 UserRow mounted', {
    contextId: context.id,
    userId: user.value?.['id']
  })
})
</script>

<style scoped>
.user-row {
  display: grid;
  grid-template-columns: 50px repeat(4, 1fr) 80px;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #e9ecef;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.user-row:hover {
  background: #f8f9fa;
}

.user-row.selected {
  background: #e7f3ff;
  border-left: 3px solid #0d6efd;
}

.row-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
}

.row-checkbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.row-level-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: #6c757d;
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  opacity: 0.6;
}
</style>
