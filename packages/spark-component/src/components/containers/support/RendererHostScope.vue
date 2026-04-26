<template>
  <template v-for="(child, index) in props.children" :key="nodeId(child) ?? index">
    <SparkComponentRenderer :config="child" />
  </template>
  <slot />
</template>

<script setup lang="ts">
/**
 * 作用域 host 载体：为子树提供行数据与动作能力。
 *
 * 主要职责：
 * 1. 按 row 有条件地 provide DATA_ROW（通过 rowMirror 同步，防止引用替换）。
 * 2. 按 actionCapability 有条件地 provide ACTION_CAPABILITY。
 * 3. 渲染 children 子节点（也可用 slot 替代）。
 */
import { shallowReactive, watch } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import {
  ACTION_CAPABILITY,
  DATA_ROW,
  SparkComponentRenderer,
  createActionCapability,
  nodeId,
  useSparkComponent,
  type SparkActionCapability,
  type SparkNode,
} from '../../internal'
import { syncReactiveRow } from '../../support/row-mirror-sync'

const props = withDefaults(defineProps<{
  type?: string
  row?: IDataRow | undefined
  actionCapability?: SparkActionCapability | undefined
  children?: SparkNode[]
}>(), {
  type: 'r-host-data-scope',
  children: () => [],
})

const { sparkProvide, sparkRemove } = useSparkComponent({ type: props.type })

const rowMirror = shallowReactive<IDataRow>({})
let hasProvidedRow = false
let hasProvidedActionCapability = false

function resolveInputRow(): IDataRow | undefined {
  return props.row
}

watch(
  resolveInputRow,
  (newRow) => {
    if (newRow === undefined) {
      if (hasProvidedRow) {
        sparkRemove(DATA_ROW)
        hasProvidedRow = false
      }
      return
    }
    if (!hasProvidedRow) {
      sparkProvide(DATA_ROW, rowMirror)
      hasProvidedRow = true
    }
    syncReactiveRow(rowMirror, newRow)
  },
  { immediate: true, deep: true },
)

watch(
  () => props.actionCapability,
  (capability) => {
    if (!capability) {
      if (hasProvidedActionCapability) {
        sparkRemove(ACTION_CAPABILITY)
        hasProvidedActionCapability = false
      }
      return
    }
    sparkProvide(ACTION_CAPABILITY, createActionCapability(capability))
    hasProvidedActionCapability = true
  },
  { immediate: true },
)
</script>
