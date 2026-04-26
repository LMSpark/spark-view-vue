<template>
  <template v-for="(child, index) in resolvedChildren" :key="nodeId(child) ?? `${resolvedChildKeyPrefix}-${index}`">
    <SparkComponentRenderer :config="child" />
  </template>
  <slot />
</template>

<script setup lang="ts">
/**
 * 通用 host 载体：在当前子树建立 host 层级语义并按需注入能力与数据域。
 *
 * 与 el-form 的关系（三种模式）：
 * - r-form：el-form 由 RendererForm 自身提供，本组件运行在 el-form 内部（field-mode='form'，传入 row）。
 * - r-filter：el-form 由 RendererFieldScope 提供，本组件在 RendererFieldScope 外层作为 toolbar host。
 * - r-section / r-drawer / r-collapse：无 el-form，本组件直接承载字段（field-mode='detail'，不传 row）。
 * 本组件自身不含 el-form，DATA_ROW 仅在收到 row / rowScope 时才 provide。
 *
 * 主要职责：
 * 1. 按 fieldMode / variant 动态 provide HOST_FIELD_MODE / HOST_VARIANT。
 * 2. 按 actionHost 动态 provide ACTION_CAPABILITY（代理模式，避免 provide 泄漏）。
 * 3. 按 row / rowScope 有条件地 provide DATA_ROW（通过 rowMirror 同步，防止引用替换）。
 * 4. 渲染 children 子节点（也可用 slot 替代）。
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
import { resolveRowScopeRow } from './rowScopeResolver.js'
import { syncReactiveRow } from '../../support/row-mirror-sync'

const EMPTY_DATA_ROW = Object.freeze({}) as IDataRow

const props = withDefaults(defineProps<{
  type?: string
  fieldMode?: string | undefined
  variant?: string | undefined
  actionHost?: SparkActionCapability | undefined
  row?: IDataRow | undefined
  rowScope?: Record<string, unknown> | undefined
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
    if (currentActionHost.value?.isDisabled(action) === true) return
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

const resolvedInputRow = computed<IDataRow | undefined>(() => {
  if (props.row !== undefined) return props.row
  const rowScope = props.rowScope
  if (rowScope === undefined) return undefined
  return resolveRowScopeRow(rowScope, EMPTY_DATA_ROW)
})

watch(
  resolvedInputRow,
  (newRow) => {
    // 只有明确传入 row / rowScope 时才提供 DATA_ROW；
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
