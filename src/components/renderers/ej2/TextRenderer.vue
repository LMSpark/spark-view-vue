<script setup lang="ts">
import { computed } from 'vue'
import { TextBoxComponent as EjsTextbox } from '@syncfusion/ej2-vue-inputs'

interface Props {
  config: {
    type: string
    name: string
    value: string
    width?: number | string
    placeholder?: string
    readonly?: boolean
    multiline?: boolean
  }
  parentType?: string
  data?: Record<string, unknown>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  update: [field: string, value: unknown]
}>()

const currentValue = computed(() => {
  if (!props.data || !props.config.value) return ''
  return props.data[props.config.value] ?? ''
})

const handleChange = (args: { value: unknown }) => {
  if (!props.config.value) return
  emit('update', props.config.value, args.value)
}
</script>

<template>
  <!-- 作为 EJ2 Grid 列 -->
  <e-column 
    v-if="parentType === 'ej2-table'"
    :field="config.value"
    :header-text="config.name"
    :width="config.width"
  />
  
  <!-- 作为表单字段 -->
  <div v-else-if="parentType === 'form'" class="e-field-wrapper">
    <label class="e-field-label">{{ config.name }}</label>
    <ejs-textbox
      :value="currentValue"
      :placeholder="config.placeholder"
      :readonly="config.readonly"
      :multiline="config.multiline"
      @change="handleChange"
    />
  </div>
  
  <!-- 作为详情展示 -->
  <div v-else class="field-display">
    <span class="field-label">{{ config.name }}:</span>
    <span class="field-value">{{ currentValue || '-' }}</span>
  </div>
</template>

<style scoped>
.e-field-wrapper {
  margin-bottom: 16px;
}

.e-field-label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: #303133;
}

.field-display {
  padding: 8px 0;
}

.field-label {
  font-weight: 500;
  color: #606266;
  margin-right: 8px;
}

.field-value {
  color: #303133;
}
</style>
