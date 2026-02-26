<template>
  <div v-if="isVisible" class="user-field" :class="{ highlight }">
    <span class="field-icon">{{ fieldIcon }}</span>
    <div class="field-content">
      <span class="field-label">{{ fieldLabel }}</span>
      <span class="field-value">{{ displayValue }}</span>
    </div>
    <div class="field-level-badge">字段级</div>
  </div>
</template>

<script setup lang="ts">
/**
 * UserField - 用户字段展示组件
 * 
 * 用于显示用户数据的单个字段，支持图标、标签和值的展示。
 * 该组件演示了 SPARK 能力系统的多层级数据消费：
 * - 从 Row 层消费行数据（ROW_DATA）
 * - 监听行级事件（ROW_EVENTS）
 * 
 * @component UserField
 * @example
 * ```vue
 * <UserField 
 *   :config="{ type: 'user-field', props: { field: 'name' } }"
 *   label="用户名"
 *   icon="👤"
 * />
 * ```
 * 
 * @author SPARK Team
 * @since v1.0.0
 */
import { computed, onMounted } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { ROW_DATA, ROW_EVENTS } from '@spark-view/spark-utils'
import type { ComponentConfig } from '@spark-view/spark-component'

interface Props {
  /**
   * 组件配置对象
   * @required
   * @example { type: 'user-field', props: { field: 'name', value: 'John' } }
   */
  config: ComponentConfig
  
  /**
   * 字段值（当未从 ROW_DATA 获取时使用）
   * @default undefined
   * @example 'John Doe' | 25 | true
   */
  value?: string | number
  
  /**
   * 字段标签文本
   * @default '' 
   * @example '用户名' | '年龄' | '状态'
   */
  label?: string
  
  /**
   * 字段图标 emoji
   * @default '📝'
   * @example '👤' | '📧' | '📱'
   */
  icon?: string
  
  /**
   * 是否高亮显示（用于响应交互事件）
   * @default false
   */
  highlight?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  icon: '📝',
  highlight: false
})

// 使用 SPARK 能力系统
const { 
  context,
  isVisible,
  consume,
  consumeEvents,
  logger 
} = useSparkComponent(props.config)
const rowData = consume(ROW_DATA)

// 2. 消费父组件的行事件能力（使用 consumeEvents 自动注册监听器）
consumeEvents(ROW_EVENTS, {
  'row:click': (user: unknown) => {
    logger.info('🔔 Field received row click event:', user)
    // 可以在这里添加高亮效果等
  }
})

// 计算图标（优先级：config.props > props）
const fieldIcon = computed(() => {
  return (props.config.props?.['icon'] as string) || props.icon || '📝'
})

// 计算标签（优先级：config.props > props）
const fieldLabel = computed(() => {
  return (props.config.props?.['label'] as string) || props.label || ''
})

// 计算显示值
const displayValue = computed(() => {
  const field = props.config.props?.['field'] as string
  
  if (rowData?.getField && field) {
    const value = rowData.getField(field)
    
    // 格式化显示
    if (field === 'status') {
      return value === 'active' ? '✅ 活跃' : '⭕ 非活跃'
    }
    
    return value
  }
  
  return props.config.props?.['value'] ?? props.value
})

onMounted(() => {
  const field = props.config.props?.['field'] as string
  logger.info('🚀 UserField mounted', {
    contextId: context.id,
    field: field,
    value: displayValue.value
  })
})
</script>

<style scoped>
.user-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  position: relative;
  transition: all 0.2s;
}

.user-field.highlight {
  background: rgba(13, 110, 253, 0.1);
  border-radius: 4px;
}

.field-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.field-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.field-label {
  font-size: 11px;
  color: #6c757d;
  font-weight: 500;
  text-transform: uppercase;
}

.field-value {
  font-size: 14px;
  color: #212529;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-level-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: #198754;
  color: white;
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 2px;
  opacity: 0.7;
}
</style>
