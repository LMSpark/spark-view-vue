<script setup lang="ts">
import { computed } from 'vue'

/**
 * NumberRenderer - 数字类型渲染器
 * 根据 parentType 决定渲染方式
 */

defineOptions({
  name: 'NumberRenderer'
})

interface Props {
  config: {
    type: string
    name: string
    value: string
    width?: number | string
    min?: number
    max?: number
    precision?: number
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
  if (!props.data || !props.config.value) return 0
  const val = props.data[props.config.value]
  return typeof val === 'number' ? val : Number(val) || 0
})

function handleUpdate(value: any) {
  emit('update', props.config.value, value)
}
</script>

<template>
  <!-- 作为表格列 -->
  <el-table-column 
    v-if="parentType === 'table'"
    :label="config.name"
    :prop="config.value"
    :width="config.width"
  >
    <!-- 支持自定义列内容 -->
    <template #default="scope">
      <slot :row="scope.row" :column="scope.column" :index="scope.$index">
        {{ scope.row[config.value] }}
      </slot>
    </template>
  </el-table-column>
  
  <!-- 作为表单字段 -->
  <el-form-item 
    v-else-if="parentType === 'form'"
    :label="config.name"
  >
    <slot :value="currentValue" :update="handleUpdate" :min="config.min" :max="config.max">
      <el-input-number 
        :model-value="currentValue"
        :min="config.min"
        :max="config.max"
        :precision="config.precision"
        @update:model-value="handleUpdate"
      />
    </slot>
  </el-form-item>
  
  <!-- 作为详情展示 -->
  <div v-else class="number-renderer">
    <slot :value="currentValue" :label="config.name">
      <span class="label">{{ config.name }}:</span>
      <span class="value">{{ currentValue }}</span>
    </slot>
  </div>
</template>

<style scoped>
.number-renderer {
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
  font-variant-numeric: tabular-nums;
}
</style>
