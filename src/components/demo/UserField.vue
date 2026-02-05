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
import { Spark } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import type { RowDataCapability, RowEventsCapability } from './types'

interface Props {
  config: ComponentConfig
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
  logger 
} = Spark.useSpark(props.config)

// ============ 能力消费 ============

// 1. 消费父组件（UserRow）的行数据能力
const rowData = consume('rowData')

// 2. 消费父组件的行事件能力
const rowEvents = consume('rowEvents')

// 3. 消费 Grid 层的字段元数据能力
const fieldMetadata = consume('fieldMetadata')

const events = rowEvents?.value as RowEventsCapability | null
if (events) {
  // 监听行事件
  events.on('row:click', (user: unknown) => {
    logger.debug('🔔 Field received row click event:', user)
  })
}

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
  // 直接使用能力对象（不需要 .value）
  const data = rowData as unknown as RowDataCapability | null
  const field = props.config.props?.field as string
  
  if (data && typeof data.getField === 'function') {
    if (field) {
      const value = data.getField(field)
      
      // 格式化显示
      if (field === 'status') {
        return value === 'active' ? '✅ 活跃' : '⭕ 非活跃'
      }
      
      return value
    }
  }
  
  // 回退到 config.props.value
  const configValue = props.config.props?.value
  if (configValue !== undefined) {
    return configValue
  }
  
  // 最后回退到 props.value
  return props.value
})

// 是否选中
const isRowSelected = computed(() => {
  const data = rowData as unknown as RowDataCapability | null
  return data?.isSelected() || false
})

onMounted(() => {
  const data = rowData as unknown as RowDataCapability | null
  const field = props.config.props?.field as string
  
  logger.info('🚀 UserField mounted (Field Level)', {
    contextId: context.id,
    field: field,
    label: fieldLabel.value,
    icon: fieldIcon.value,
    metadataSource: metadata.value ? 'Grid元数据' : 'config.props',
    metadata: metadata.value,
    displayValue: displayValue.value,
    rawRowData: data?.getData(),
    fieldValueFromRowData: data ? data.getField(field) : null,
    consumedCapabilities: ['rowData', 'rowEvents', 'fieldMetadata'],
    hasRowData: !!rowData,
    hasMetadata: !!fieldMetadata,
    isSelected: isRowSelected.value
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
