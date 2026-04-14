<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-transfer
        :model-value="fieldValue"
        :data="transferData"
        :titles="titles"
        :filterable="filterable"
        :filter-placeholder="filterPlaceholder"
        :target-order="targetOrder"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-transfer
 * @description 穿梭框字段，绑定数组值，基于 el-transfer 提供双面板列表项转移选择，支持搜索过滤。
 */
import { useOptionFieldState } from './composables/useOptionFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RTransferProps, TransferValue } from './FieldTransfer.props'

const props = withDefaults(defineProps<RTransferProps>(), {
  type: 'r-transfer',
  titles: () => ['待选', '已选'] as [string, string],
  filterable: false,
  filterPlaceholder: '请输入关键词',
  targetOrder: 'original',
})

const emit = defineEmits<FieldValueUpdateEmits<TransferValue>>()

const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<TransferValue>({
  props,
  fieldType: 'r-transfer',
  fallbackValue: [],
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { transferData, fieldValue, isCurrentFieldEditable } = optionResult

async function handleChange(value: TransferValue): Promise<void> {
  await handleControlledChange(value)
}
</script>
