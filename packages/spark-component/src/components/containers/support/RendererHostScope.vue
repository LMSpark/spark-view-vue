<template>
  <template v-for="(child, index) in resolvedChildren" :key="nodeId(child) ?? `${resolvedChildKeyPrefix}-${index}`">
    <SparkComponentRenderer :config="child" />
  </template>
  <slot />
</template>

<script setup lang="ts">
/**
 * Host + data scope carrier.
 *
 * 在当前子树建立 host 层级语义，并在需要时注入 DATA_ROW 数据域；
 * 如果直接传入 children，则由本组件统一负责作用域内子节点渲染。
 *
 * 命名约定：
 * - 组件层级语义统一使用 host
 * - 数据域语义继续保持 scope（DATA_ROW 作用域不变）
 * - 载体组件命名保持 host 主语义，不在文件名重复数据域细节
 */
import { computed, shallowReactive, watch } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import { DATA_ROW, SparkComponentRenderer, nodeId, useSparkComponent, type SparkComponentHost, type SparkNode } from '../../internal'
import { useContainerHostBridge } from '../composables/useContainerHostBridge'
import { syncReactiveRow } from '../../support/row-mirror-sync'

const props = withDefaults(defineProps<{
  type?: string
  host?: SparkComponentHost | undefined
  row?: IDataRow | undefined
  children?: SparkNode[] | undefined
  childKeyPrefix?: string | undefined
}>(), {
  type: 'r-host-data-scope',
})

const { host, sparkProvide } = useSparkComponent({ type: props.type })

const currentHost = computed(() => props.host)
useContainerHostBridge(host, currentHost)

const rowMirror = shallowReactive<IDataRow>({})
let providedRowMirror = false

watch(
  () => props.row,
  (newRow) => {
    // 只有明确传入 row prop 时才提供 DATA_ROW；
    // 无 row 的纯 host 作用域（如 r-detail 字段区）不应覆盖父级已提供的 DATA_ROW。
    if (newRow === undefined) return

    if (!providedRowMirror) {
      sparkProvide(DATA_ROW, rowMirror)
      providedRowMirror = true
    }

    syncReactiveRow(rowMirror, newRow)
  },
  { immediate: true, deep: true },
)

const resolvedChildren = computed(() => props.children ?? [])
const resolvedChildKeyPrefix = computed(() => props.childKeyPrefix ?? 'renderer-host-scope-child')
</script>
