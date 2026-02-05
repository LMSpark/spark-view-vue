<template>
  <div class="user-field" :class="{ highlight }">
    <span class="field-icon">{{ icon }}</span>
    <div class="field-content">
      <span class="field-label">{{ label }}</span>
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
  value: string | number
  label: string
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

const events = rowEvents?.value as RowEventsCapability | null
if (events) {
  // 监听行事件
  events.on('row:click', (user: unknown) => {
    logger.debug('🔔 Field received row click event:', user)
  })
}

// 计算显示值
const displayValue = computed(() => {
  // 优先使用能力系统获取数据
  const data = rowData?.value as RowDataCapability | null
  if (data) {
    const field = props.config.props?.field as string
    const value = data.getField(field)
    
    // 格式化显示
    if (field === 'status') {
      return value === 'active' ? '✅ 活跃' : '⭕ 非活跃'
    }
    
    return value
  }
  
  // 回退到 props
  return props.value
})

// 是否选中
const isRowSelected = computed(() => {
  const data = rowData?.value as RowDataCapability | null
  return data?.isSelected() || false
})

onMounted(() => {
  logger.info('🚀 UserField mounted (Field Level)', {
    contextId: context.id,
    field: props.label,
    consumedCapabilities: ['rowData', 'rowEvents'],
    hasRowData: !!rowData,
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
