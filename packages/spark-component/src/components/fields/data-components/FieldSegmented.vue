<!--
@module @spark-appworks/spark-component:components/fields/data-components/FieldSegmented
FieldSegmented 模块，属于 SPARK component field-level/data-field。
组件目录: fields/data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <el-segmented
    v-if="isVisible"
    :model-value="selectedValue"
    :options="resolvedOptions"
    :size="size"
    :block="block"
    :disabled="isDisabled || !isCurrentFieldEditable"
    @update:model-value="handleChange"
  />
</template>

<script setup lang="ts">
/**
 * @description 分段选择器字段，绑定 string/number 值。
 */
import { ref, computed, watch } from 'vue'
import { useSparkPageComponent } from '../../internal'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { useOptionFieldState } from './composables/useOptionFieldState'
import { coercePrimitiveOptionValue } from './composables/fieldValueCoercion'
import type { RSegmentedProps } from './FieldSegmented.props'

const props = withDefaults(defineProps<RSegmentedProps>(), {
  type: 'r-segmented',
  size: 'default',
  block: false,
})

const emit = defineEmits<FieldValueUpdateEmits<string | number> & {
  /**
   * Segmented value changed; 用户切换分段选项。
   * @param value Next selected segment value.
   */
  change: [value: string | number]
}>()

const { isVisible, isDisabled } = useSparkPageComponent(props)

const { optionResult, handleControlledChange } = useOptionFieldState<string | number>({
  props,
  fieldType: 'r-segmented',
  fallbackValue: '',
  coerce: coercePrimitiveOptionValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { options: fieldOptions, fieldValue, isCurrentFieldEditable } = optionResult

type ResolvedSegmentedOption = {
  label: string
  value: string | number
  disabled?: boolean}

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

const selectedValue = ref(props.modelValue ?? resolvedOptions.value[0]?.value ?? '')

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
