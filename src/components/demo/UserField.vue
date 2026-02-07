<template>
  <div class="user-field" :class="{ highlight }">
    <span class="field-icon">{{ fieldIcon }}</span>
    <div class="field-content">
      <span class="field-label">{{ fieldLabel }}</span>
      <span class="field-value">{{ displayValue }}</span>
    </div>
    <div class="field-level-badge">字段级</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { ROW_DATA, ROW_EVENTS, FIELD_METADATA } from '@spark-view/spark-utils'
import type { ComponentContext } from '@spark-view/spark-component'
import type { RowDataCapability } from './types'

interface Props {
  config: Partial<ComponentContext>
  value?: string | number
  label?: string
  icon?: string
  highlight?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  icon: '📝',
  highlight: false
})

// 使用 SPARK 能力系统
const { 
  context,
  consume,
  consumeEvents,
  logger 
} = useSparkComponent(props.config as ComponentContext)
const rowData = consume(ROW_DATA)

// 2. 消费父组件的行事件能力（使用 consumeEvents 自动注册监听器）
consumeEvents(ROW_EVENTS, {
  'row:click': (user: unknown) => {
    logger.info('🔔 Field received row click event:', user)
    // 可以在这里添加高亮效果等
  }
})

// 3. 消费 Grid 层的字段元数据能力
const fieldMetadata = consume(FIELD_METADATA)

// 获取当前字段名
const currentField = computed(() => props.config.props?.field as string)

// 获取字段元数据
const metadata = computed(() => {
  const field = currentField.value
  const meta = fieldMetadata as unknown as Record<string, { label: string; icon: string; type: string }> | null
  return field && meta ? meta[field] : null
})

// 计算图标（优先级：元数据 > config.props > props）
const fieldIcon = computed(() => {
  return metadata.value?.icon || (props.config.props?.icon as string) || props.icon || '📝'
})

// 计算标签（优先级：元数据 > config.props > props）
const fieldLabel = computed(() => {
  return metadata.value?.label || (props.config.props?.label as string) || props.label || ''
})

// 计算显示值
const displayValue = computed(() => {
  const data = rowData as unknown as RowDataCapability | null
  const field = props.config.props?.field as string
  
  if (data?.getField && field) {
    const value = data.getField(field)
    
    // 格式化显示
    if (field === 'status') {
      return value === 'active' ? '✅ 活跃' : '⭕ 非活跃'
    }
    
    return value
  }
  
  return props.config.props?.value ?? props.value
})

onMounted(() => {
  const field = props.config.props?.field as string
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
