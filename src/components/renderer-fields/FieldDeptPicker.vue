<template>
  <FieldEntityPicker v-bind="forwardedProps" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ComponentConfig } from '@spark-view/spark-component'
import type { PageSelectableValue } from '@spark-view/spark-utils'
import FieldEntityPicker from './FieldEntityPicker.vue'

type EntityPickerValue = PageSelectableValue | PageSelectableValue[] | string

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  modelValue?: EntityPickerValue
  options?: unknown[]
  optionLabelField?: string
  optionValueField?: string
  placeholder?: string
  buttonText?: string
  readonlyButtonText?: string
  clearable?: boolean
  multiple?: boolean
  searchable?: boolean
  separator?: string
  valueMode?: 'auto' | 'array' | 'comma-string'
  entityName?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择部门',
  buttonText: '选部门',
  readonlyButtonText: '查看部门',
  clearable: true,
  multiple: false,
  searchable: true,
  separator: ', ',
  valueMode: 'auto',
  entityName: '部门',
})

const forwardedProps = computed<Record<string, unknown>>(() => ({
  ...(props.config !== undefined ? { config: props.config } : {}),
  ...(props.name !== undefined ? { name: props.name } : {}),
  ...(props.label !== undefined ? { label: props.label } : {}),
  ...(props.width !== undefined ? { width: props.width } : {}),
  ...(props.modelValue !== undefined ? { modelValue: props.modelValue } : {}),
  ...(props.options !== undefined ? { options: props.options } : {}),
  ...(props.optionLabelField !== undefined ? { optionLabelField: props.optionLabelField } : {}),
  ...(props.optionValueField !== undefined ? { optionValueField: props.optionValueField } : {}),
  placeholder: props.placeholder,
  buttonText: props.buttonText,
  readonlyButtonText: props.readonlyButtonText,
  clearable: props.clearable,
  multiple: props.multiple,
  searchable: props.searchable,
  separator: props.separator,
  valueMode: props.valueMode,
  entityName: props.entityName,
}))
</script>