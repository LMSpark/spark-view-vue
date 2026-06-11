<!--
@module @spark-appworks/spark-component:components/fields/data-components/FieldTreeSelect
FieldTreeSelect 模块，属于 SPARK component field-level/data-field。
组件目录: fields/data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-tree-select
        :model-value="fieldValue"
        :data="options"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :multiple="multiple"
        :check-strictly="checkStrictly"
        :default-expand-all="defaultExpandAll"
        :render-after-expand="renderAfterExpand"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 树形选择字段，绑定单值或数组。
 */
import { useOptionFieldState } from './composables/useOptionFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { coerceTreeSelectValue } from './composables/fieldValueCoercion'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RTreeSelectProps } from './FieldTreeSelect.props'

const props = withDefaults(defineProps<RTreeSelectProps>(), {
  type: 'r-tree-select',
  placeholder: '请选择',
  clearable: true,
  filterable: false,
  multiple: false,
  checkStrictly: false,
  defaultExpandAll: false,
  renderAfterExpand: true,
})

const emit = defineEmits<FieldValueUpdateEmits<string | number | boolean | Array<string | number | boolean>>>()

const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<string | number | boolean | Array<string | number | boolean>>({
  props,
  fieldType: 'r-tree-select',
  fallbackValue: '',
  coerce: coerceTreeSelectValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { options, fieldValue, isCurrentFieldEditable } = optionResult

async function handleChange(value: string | number | boolean | Array<string | number | boolean>): Promise<void> {
  await handleControlledChange(value)
}
</script>

