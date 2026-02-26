<template>
  <!-- 在 table 中：渲染为 el-table-column -->
  <el-table-column
    v-if="context === 'table'"
    :label="name"
    :prop="value"
    :width="width"
  />

  <!-- 在 form 中：渲染为 el-form-item + el-input -->
  <el-form-item v-else-if="context === 'form'" :label="name">
    <el-input
      :model-value="fieldValue as string"
      @update:model-value="handleChange"
    />
  </el-form-item>

  <!-- 在 tree 中：渲染为树节点的文本内容 -->
  <template v-else-if="context === 'tree'">
    <span class="tree-node-text">{{ fieldValue || '' }}</span>
  </template>

  <!-- 在 detail 或其他上下文中：只读展示 -->
  <div v-else class="field-display">
    <span class="field-label">{{ name }}：</span>
    <span class="field-value">{{ fieldValue || '' }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * FieldText - 智能文本字段组件
 * 
 * 根据父容器注入的 fieldContext 自动适配渲染方式：
 * - table → el-table-column
 * - form  → el-form-item + el-input
 * - 其他  → 只读文本展示
 */
import { computed } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { FIELD_CONTEXT, CONTEXT_DATA } from '../capability-keys'

interface Props {
  name?: string
  value?: string
  width?: number
  modelValue?: string
}

const props = withDefaults(defineProps<Props>(), {
  name: '',
  value: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// 从 SPARK 能力链消费父容器提供的上下文
const { consume } = useSparkComponent({ type: 'r-text' })
const context = consume(FIELD_CONTEXT) ?? 'detail'
const contextData = consume(CONTEXT_DATA) ?? {}

// 字段值：优先 modelValue，其次从 contextData 取
const fieldValue = computed(() => {
  if (props.modelValue !== undefined) return props.modelValue
  if (contextData && props.value) return contextData[props.value]
  return ''
})

const handleChange = (val: string) => {
  emit('update:modelValue', val)
  // 同步到 contextData（form 模式）
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
