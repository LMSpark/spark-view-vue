<script setup lang="ts">
import { computed } from 'vue'

/**
 * DateRenderer - 日期类型渲染器
 */

defineOptions({
  name: 'DateRenderer'
})

interface Props {
  config: {
    type: string
    name: string
    value: string
    width?: number | string
    format?: string
    valueFormat?: string
    [key: string]: any
  }
  parentType?: string
  data?: any
}

const props = withDefaults(defineProps<Props>(), {
  parentType: '',
  data: () => ({})
})

const emit = defineEmits<{
  update: [field: string, value: any]
}>()

const currentValue = computed(() => {
  if (!props.data || !props.config.value) return ''
  return props.data[props.config.value] || ''
})

function handleUpdate(value: any) {
  emit('update', props.config.value, value)
}

// 默认格式
const displayFormat = computed(() => props.config.format || 'YYYY-MM-DD')
const valueFormat = computed(() => props.config.valueFormat || 'YYYY-MM-DD')
</script>

<template>
  <!-- 作为表格列 -->
  <el-table-column 
    v-if="parentType === 'table'"
    :label="config.name"
    :prop="config.value"
    :width="config.width"
  />
  
  <!-- 作为表单字段 -->
  <el-form-item 
    v-else-if="parentType === 'form'"
    :label="config.name"
  >
    <el-date-picker 
      :model-value="currentValue"
      :format="displayFormat"
      :value-format="valueFormat"
      :placeholder="`选择${config.name}`"
      @update:model-value="handleUpdate"
    />
  </el-form-item>
  
  <!-- 作为详情展示 -->
  <div v-else class="date-renderer">
    <span class="label">{{ config.name }}:</span>
    <span class="value">{{ currentValue }}</span>
  </div>
</template>

<style scoped>
.date-renderer {
  display: flex;
  gap: 8px;
  padding: 4px 0;
}

.label {
  font-weight: 500;
  color: #606266;
}

.value {
  color: #303133;
}
</style>
