<template>
  <!-- 在 table 中：渲染为 el-table-column -->
  <el-table-column
    v-if="context === 'table'"
    :label="displayLabel"
    :prop="fieldName"
    :width="width"
  />

  <!-- 在 form 中：渲染为 el-form-item + el-date-picker -->
  <el-form-item v-else-if="context === 'form'" :label="displayLabel">
    <el-date-picker
      :model-value="fieldValue as string | Date"
      type="date"
      placeholder="选择日期"
      @update:model-value="handleChange"
    />
  </el-form-item>

  <!-- 在 tree 中：渲染为树节点的日期内容 -->
  <template v-else-if="context === 'tree'">
    <span class="tree-node-date">{{ displayValue }}</span>
  </template>

  <!-- 在 detail 或其他上下文中：只读展示 -->
  <div v-else class="field-display">
    <span class="field-label">{{ displayLabel }}：</span>
    <span class="field-value">{{ displayValue }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * FieldDate - 智能日期字段组件
 *
 * config.name = 字段名（与父组件 dataKey 叠加定位数据）
 * config.props.label = 显示标签（可选，默认回退到 name）
 *
 * 根据父容器注入的 fieldContext 自动适配渲染方式：
 * - table → el-table-column（prop = name）
 * - form  → el-form-item + el-date-picker
 * - 其他  → 只读日期展示
 */
import { computed } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import { FIELD_CONTEXT, CONTEXT_DATA } from '../capability-keys'

interface Props {
  config?: ComponentConfig
  /** 字段名（form-create 路径透传；SparkComponentRenderer 路径从 config.name 读取） */
  name?: string
  /** 显示标签（可选，默认回退到 name） */
  label?: string
  width?: number
  modelValue?: string | Date
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string | Date]
}>()

// 字段名：config.name（SparkComponentRenderer）> props.name（form-create bindRules 透传）
const fieldName = computed(() => props.config?.name ?? props.name ?? '')
// 显示标签：label > name
const displayLabel = computed(() => props.label ?? fieldName.value)

// 从 SPARK 能力链消费父容器提供的上下文
const { consume } = useSparkComponent(props.config ?? { type: 'r-date' })
const context = consume(FIELD_CONTEXT) ?? 'detail'
const contextData = consume(CONTEXT_DATA) ?? {}

// 字段值：优先 modelValue，其次从 contextData[name] 取
const fieldValue = computed(() => {
  if (props.modelValue !== undefined) return props.modelValue
  if (contextData && fieldName.value) return contextData[fieldName.value] as string
  return ''
})

// 显示值（detail 模式格式化）
const displayValue = computed(() => {
  const v = fieldValue.value
  if (!v) return ''
  if (typeof v === 'string') return v
  if (v instanceof Date) return v.toLocaleDateString()
  return String(v)
})

const handleChange = (val: string | Date) => {
  emit('update:modelValue', val)
  if (contextData && fieldName.value) {
    contextData[fieldName.value] = val
  }
}
</script>

<style scoped>
.field-display {
  margin-bottom: 12px;
  line-height: 32px;
}
.field-label {
  color: #606266;
  font-weight: 500;
  margin-right: 8px;
}
.field-value {
  color: #303133;
}
</style>
