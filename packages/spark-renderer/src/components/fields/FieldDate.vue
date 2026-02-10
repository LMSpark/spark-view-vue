<template>
  <!-- 在 table 中：渲染为 el-table-column -->
  <el-table-column
    v-if="context === 'table'"
    :label="name"
    :prop="value"
    :width="width"
  />

  <!-- 在 form 中：渲染为 el-form-item + el-date-picker -->
  <el-form-item v-else-if="context === 'form'" :label="name">
    <el-date-picker
      :model-value="fieldValue as string | Date"
      type="date"
      placeholder="选择日期"
      @update:model-value="handleChange"
    />
  </el-form-item>

  <!-- 在 detail 或其他上下文中：只读展示 -->
  <div v-else class="field-display">
    <span class="field-label">{{ name }}：</span>
    <span class="field-value">{{ displayValue }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * FieldDate - 智能日期字段组件
 * 
 * 根据父容器注入的 fieldContext 自动适配渲染方式：
 * - table → el-table-column
 * - form  → el-form-item + el-date-picker
 * - 其他  → 只读日期展示
 */
import { computed, inject } from 'vue'

interface Props {
  name?: string
  value?: string
  width?: number
  modelValue?: string | Date
}

const props = withDefaults(defineProps<Props>(), {
  name: '',
  value: '',
  width: undefined,
  modelValue: undefined
})

const emit = defineEmits<{
  'update:modelValue': [value: string | Date]
}>()

// 从父容器注入上下文
const context = inject<string>('fieldContext', 'detail')
const contextData = inject<Record<string, unknown>>('contextData', {})

// 字段值：优先 modelValue，其次从 contextData 取
const fieldValue = computed(() => {
  if (props.modelValue !== undefined) return props.modelValue
  if (contextData && props.value) return contextData[props.value] as string
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
  if (contextData && props.value) {
    contextData[props.value] = val
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
