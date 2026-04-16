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
 * - 数据域语义统一使用 data / dataScope
 * - 合并承载两者时，文件名同时带上 host + data
 */
import { computed, shallowReactive, watch } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import { DATA_ROW, SparkComponentRenderer, nodeId, useSparkComponent, type SparkComponentHost, type SparkNode } from '../../internal'

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

const hostProxy: SparkComponentHost = {
  get fieldMode(): string | undefined {
    return currentHost.value?.fieldMode
  },
  get variant(): string | undefined {
    return currentHost.value?.variant
  },
  isDisabled(action) {
    return currentHost.value?.isDisabled?.(action) ?? false
  },
  execute(action) {
    currentHost.value?.execute?.(action)
  },
}

watch(
  currentHost,
  (resolvedHost) => {
    if (resolvedHost !== undefined) {
      host.setHost(hostProxy)
    }
  },
  { immediate: true },
)

const rowMirror = shallowReactive<IDataRow>({})
let providedRowMirror = false

function syncRow(target: IDataRow, source: IDataRow): void {
  const incomingKeys = new Set(Object.keys(source))

  for (const key of Object.keys(target)) {
    if (!incomingKeys.has(key)) {
      target[key] = undefined
    }
  }

  for (const key of incomingKeys) {
    if (target[key] !== source[key]) {
      target[key] = source[key]
    }
  }
}

watch(
  () => props.row,
  (newRow) => {
    if (newRow === undefined) {
      for (const key of Object.keys(rowMirror)) {
        rowMirror[key] = undefined
      }
      return
    }

    if (!providedRowMirror) {
      sparkProvide(DATA_ROW, rowMirror)
      providedRowMirror = true
    }

    syncRow(rowMirror, newRow)
  },
  { immediate: true, deep: true },
)

const resolvedChildren = computed(() => props.children ?? [])
const resolvedChildKeyPrefix = computed(() => props.childKeyPrefix ?? 'renderer-host-data-scope-child')
</script>
