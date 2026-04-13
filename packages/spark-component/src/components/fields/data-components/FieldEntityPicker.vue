<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <div class="entity-picker-field">
        <el-input
          :model-value="currentDisplayValue"
          readonly
          :placeholder="placeholder"
        />
        <el-button class="primary-action-button" :disabled="!hasSelectorCapability" @click="openSelector">{{ primaryActionText }}</el-button>
        <el-button v-if="showClearButton" class="clear-action-button" @click="clearValue">清空</el-button>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-entity-picker
 * @description 通用实体选择器字段，绑定实体对象或 ID 值，弹窗选择单个或多个实体记录。
 */
import { computed } from 'vue'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import { useSelectorFieldActions } from '../actions/useSelectorFieldActions'
import { useEntityPickerState } from './composables/useEntityPickerState'
import { useOptionFieldState } from './composables/useOptionFieldState'
import type { REntityPickerProps, EntityPickerValue } from './FieldEntityPicker.props'

const props = withDefaults(defineProps<REntityPickerProps>(), {
  type: 'r-entity-picker',
  placeholder: '请选择',
  buttonText: '选择',
  readonlyButtonText: '查看',
  clearable: true,
  multiple: false,
  searchable: true,
  separator: ', ',
  valueMode: 'auto',
  entityName: '项目',
})

const emit = defineEmits<{
  'update:modelValue': [value: EntityPickerValue]
}>()

const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<EntityPickerValue>({
  props,
  fieldType: 'r-entity-picker',
  fallbackValue: '',
  emitUpdate: value => emit('update:modelValue', value),
})

const {
  flatOptions,
  pageService,
  currentRawValue,
  currentRawStringValue,
  isCurrentFieldEditable,
  currentDisplayValue,
} = optionResult

const { hasSelectorCapability, primaryAction, selectEntities } = useSelectorFieldActions({
  pageService,
  isEditable: isCurrentFieldEditable,
})

async function updateValue(value: EntityPickerValue): Promise<void> {
  await handleControlledChange(value)
}

const {
  primaryActionText,
  showClearButton,
  openSelector,
  clearValue,
} = useEntityPickerState({
  buttonText: computed(() => props.buttonText),
  readonlyButtonText: computed(() => props.readonlyButtonText),
  clearable: computed(() => props.clearable),
  multiple: computed(() => props.multiple),
  searchable: computed(() => props.searchable),
  separator: computed(() => props.separator),
  valueMode: computed(() => props.valueMode),
  entityName: computed(() => props.entityName),
  placeholder: computed(() => props.placeholder),
  flatOptions,
  currentRawValue,
  currentRawStringValue,
  isCurrentFieldEditable,
  hasSelectorCapability,
  primaryAction,
  selectEntities,
  updateValue,
})
</script>

<style scoped>
.entity-picker-field {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.entity-picker-field :deep(.el-input) {
  flex: 1;
}
</style>
