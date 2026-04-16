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
import {
  ACTION_CAPABILITY,
  DATA_ROW,
  HOST_FIELD_MODE,
  HOST_VARIANT,
  SparkComponentRenderer,
  nodeId,
  useSparkComponent,
  type SparkActionCapability,
  type SparkNode,
} from '../../internal'
import { syncReactiveRow } from '../../support/row-mirror-sync'

const props = withDefaults(defineProps<{
  type?: string
  fieldMode?: string | undefined
  variant?: string | undefined
  actionHost?: SparkActionCapability | undefined
  row?: IDataRow | undefined
  children?: SparkNode[] | undefined
  childKeyPrefix?: string | undefined
}>(), {
  type: 'r-host-data-scope',
})

const { sparkProvide, sparkRemove } = useSparkComponent({ type: props.type })

watch(
  () => props.fieldMode,
  (fieldMode) => {
    if (fieldMode !== undefined) {
      sparkProvide(HOST_FIELD_MODE, fieldMode)
    } else {
      sparkRemove(HOST_FIELD_MODE)
    }
  },
  { immediate: true },
)

watch(
  () => props.variant,
  (variant) => {
    if (variant !== undefined) {
      sparkProvide(HOST_VARIANT, variant)
    } else {
      sparkRemove(HOST_VARIANT)
    }
  },
  { immediate: true },
)

const currentActionHost = computed(() => props.actionHost)
const actionHostProxy: SparkActionCapability = {
  isDisabled(action) {
    return currentActionHost.value?.isDisabled(action) ?? false
  },
  execute(action) {
    currentActionHost.value?.execute(action)
  },
}

watch(
  currentActionHost,
  (resolvedActionHost) => {
    if (resolvedActionHost === undefined) {
      sparkRemove(ACTION_CAPABILITY)
      return
    }
    sparkProvide(ACTION_CAPABILITY, actionHostProxy)
  },
  { immediate: true },
)

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
