<template>
  <template v-for="(child, index) in props.children" :key="nodeId(child) ?? index">
    <SparkComponentRenderer :config="child" />
  </template>
  <slot />
</template>

<script setup lang="ts">
/**
 * 作用域 host 载体：为子树提供行数据。
 *
 * 主要职责：
 * 1. 按 row 有条件地 provide DATA_ROW（通过 rowMirror 同步，防止引用替换）。
 * 2. 渲染 children 子节点（也可用 slot 替代）。
 */
import { shallowReactive, watch } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import {
  DATA_ROW,
  SparkComponentRenderer,
  nodeId,
  useSparkComponent,
  type SparkNode,
} from '../../internal'
import { syncReactiveRow } from '../../support/row-mirror-sync'

const props = withDefaults(defineProps<{
  type?: string
  row?: IDataRow | undefined
  children?: SparkNode[]
}>(), {
  type: 'r-host-data-scope',
  children: () => [],
})

const { sparkProvide, sparkRemove } = useSparkComponent({ type: props.type })

const rowMirror = shallowReactive<IDataRow>({})
let hasProvidedRow = false

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

</script>
