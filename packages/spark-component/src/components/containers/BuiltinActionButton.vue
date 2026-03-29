<template>
  <el-button
    :type="resolvedButtonType"
    :size="resolvedButtonSize"
    :plain="resolvedButtonPlain"
    :text="resolvedButtonText"
    :link="resolvedButtonLink"
    :disabled="resolvedDisabled"
    :class="resolvedButtonClass"
    @click="handleClick"
  >{{ resolvedLabel }}</el-button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import { DATA_SOURCE, type SparkNode, useSparkComponent } from '../internal'
import {
  getBuiltinActionLabel,
  getBuiltinButtonClass,
  getBuiltinButtonLink,
  getBuiltinButtonPlain,
  getBuiltinButtonSize,
  getBuiltinButtonText,
  getBuiltinButtonType,
  isBuiltinActionDisabled,
} from './builtin-actions'

interface Props extends SparkNode {
  builtinAction?: string
  label?: string
  buttonType?: string
  buttonSize?: string
  buttonPlain?: boolean
  buttonText?: boolean
  buttonLink?: boolean
  buttonClass?: string
  buttonDisabled?: boolean
  disabled?: boolean
  disabledWhenRow?: Record<string, unknown>
  row?: IDataRow
  rowIndex?: number
  data?: unknown
  dataSource?: unknown
}

const props = withDefaults(defineProps<Props>(), {
  type: 'builtin-action',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const { sparkConsume } = useSparkComponent(props)

function asDataView(value: unknown): DataView | null {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
    ? value as DataView
    : null
}

function asDataRow(value: unknown): IDataRow | null {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
    ? value as IDataRow
    : null
}

const actionProps = computed<Record<string, unknown>>(() => {
  const rawProps = props as unknown as Record<string, unknown>
  const {
    type: _type,
    id: _id,
    children: _children,
    dataSource: _dataSource,
    ...rest
  } = rawProps
  return rest
})

const actionNode = computed<SparkNode>(() => ({
  type: 'builtin-action',
  props: actionProps.value,
}))

const resolvedView = computed(() => {
  const propDataSource = asDataView(props.dataSource)
  if (propDataSource) return propDataSource
  return sparkConsume(DATA_SOURCE) as DataView | null
})

const resolvedRow = computed(() => props.row ?? asDataRow(props.data) ?? resolvedView.value?.currentRow ?? null)

const resolvedLabel = computed(() => getBuiltinActionLabel(actionNode.value))
const resolvedButtonType = computed(() => getBuiltinButtonType(actionNode.value))
const resolvedButtonSize = computed(() => getBuiltinButtonSize(actionNode.value))
const resolvedButtonPlain = computed(() => getBuiltinButtonPlain(actionNode.value))
const resolvedButtonText = computed(() => getBuiltinButtonText(actionNode.value))
const resolvedButtonLink = computed(() => getBuiltinButtonLink(actionNode.value))
const resolvedButtonClass = computed(() => getBuiltinButtonClass(actionNode.value))

const resolvedDisabled = computed(() => isBuiltinActionDisabled(actionNode.value, resolvedView.value, {
  ...(resolvedRow.value !== null ? { row: resolvedRow.value } : {}),
  ...(typeof props.rowIndex === 'number' ? { index: props.rowIndex } : {}),
}))

function handleClick(event: MouseEvent): void {
  emit('click', event)
}
</script>