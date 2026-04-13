<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-cascader
        :model-value="fieldValue"
        :options="options"
        :props="cascaderProps"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-cascader
 * @description 级联选择字段，绑定路径数组值，基于 el-cascader 支持多级分类选择、多选和搜索过滤。
 */
import { computed } from 'vue'
import { useOptionFieldState } from './composables/useOptionFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RCascaderProps, CascaderValue } from './FieldCascader.props'

const props = withDefaults(defineProps<RCascaderProps>(), {
  type: 'r-cascader',
  placeholder: '请选择',
  clearable: true,
  filterable: false,
  multiple: false,
  checkStrictly: false,
  emitPath: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: CascaderValue]
}>()

const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<CascaderValue>({
  props,
  fieldType: 'r-cascader',
  fallbackValue: [],
  formatDisplay: (value, helpers) => helpers.formatCascaderValue(value),
  emitUpdate: value => emit('update:modelValue', value),
})

const { options, fieldValue, isCurrentFieldEditable } = optionResult

const cascaderProps = computed(() => ({
  multiple: props.multiple,
  checkStrictly: props.checkStrictly,
  emitPath: props.emitPath,
}))

async function handleChange(value: CascaderValue): Promise<void> {
  await handleControlledChange(value)
}
</script>
