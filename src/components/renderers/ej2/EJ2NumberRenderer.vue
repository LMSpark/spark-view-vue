<script setup lang="ts">
import { computed } from 'vue'
import { NumericTextBoxComponent as EjsNumerictextbox } from '@syncfusion/ej2-vue-inputs'

interface Props {
  config: {
    type: string
    name: string
    value: string
    width?: number | string
    min?: number
    max?: number
    step?: number
    decimals?: number
    format?: string
  }
  parentType?: string
  data?: Record<string, unknown>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  update: [field: string, value: unknown]
}>()

const currentValue = computed(() => {
  if (!props.data || !props.config.value) return null
  return (props.data[props.config.value] as number | null | undefined) ?? null
})

const handleChange = (args: { value: number | null }) => {
  if (!props.config.value) return
  emit('update', props.config.value, args.value ?? null)
}
</script>

<template>
  <!-- 作为 EJ2 Grid 列 -->
  <e-column 
    v-if="parentType === 'ej2-table'"
    :field="config.value"
    :header-text="config.name"
    :width="config.width"
    type="number"
    :format="config.format || 'N2'"
  />
  
  <!-- 作为表单字段 -->
  <div v-else-if="parentType === 'form'" class="e-field-wrapper">
    <label class="e-field-label">{{ config.name }}</label>
    <slot :value="currentValue" :update="handleChange" :config="config">
      <ejs-numerictextbox
        :value="currentValue"
        :min="config.min"
        :max="config.max"
        :step="config.step || 1"
        :decimals="config.decimals ?? 0"
        :format="config.format || 'n0'"
        @change="handleChange"
      />
    </slot>
  </div>
  
  <!-- 作为详情展示 -->
  <div v-else class="field-display">
    <slot :value="currentValue" :label="config.name">
      <span class="field-label">{{ config.name }}:</span>
      <span class="field-value">{{ currentValue ?? 0 }}</span>
    </slot>
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
