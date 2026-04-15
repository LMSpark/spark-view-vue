<template>
  <el-segmented
    v-if="isVisible"
    :model-value="selectedValue"
    :options="resolvedOptions"
    :size="size"
    :block="block"
    :disabled="isDisabled || !isCurrentFieldEditable"
    v-bind="hostProps"
    @update:model-value="handleChange"
  />
</template>

<script setup lang="ts">
/**
 * @skill r-segmented
 * @description 分段选择器字段，绑定 string/number 值。
 */
import { ref, computed, watch } from 'vue'
import { useSparkPageComponent } from '../../internal'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { useOptionFieldState } from './composables/useOptionFieldState'
import type { RSegmentedProps } from './FieldSegmented.props'

const props = withDefaults(defineProps<RSegmentedProps>(), {
  type: 'r-segmented',
  size: 'default',
  block: false,
})

const emit = defineEmits<FieldValueUpdateEmits<string | number> & {
  change: [value: string | number]
}>()

const { isVisible, isDisabled } = useSparkPageComponent(props)

const { optionResult, handleControlledChange } = useOptionFieldState<string | number>({
  props,
  fieldType: 'r-segmented',
  fallbackValue: '',
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { options: fieldOptions, fieldValue, isCurrentFieldEditable } = optionResult

interface ResolvedSegmentedOption {
  label: string
  value: string | number
  disabled?: boolean
}

function toSegmentedValue(value: string | number | boolean): string | number {
  return typeof value === 'boolean' ? String(value) : value
}

const resolvedOptions = computed<ResolvedSegmentedOption[]>(() =>
  fieldOptions.value.map(option => {
    const segmentedOption: ResolvedSegmentedOption = {
      label: option.label,
      value: toSegmentedValue(option.value),
    }
    if (option.disabled === true) {
      segmentedOption.disabled = true
    }
    return segmentedOption
  }),
)

const selectedValue = ref(props.value ?? resolvedOptions.value[0]?.value ?? '')

watch(() => fieldValue.value, (value) => {
  if (value === undefined || value === null || value === '') {
    selectedValue.value = resolvedOptions.value[0]?.value ?? ''
    return
  }
  selectedValue.value = toSegmentedValue(value)
})

async function handleChange(val: string | number) {
  selectedValue.value = val
  await handleControlledChange(val)
  emit('change', val)
}
</script>


