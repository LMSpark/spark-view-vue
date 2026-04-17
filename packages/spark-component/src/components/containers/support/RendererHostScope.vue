<template>
  <div
    v-if="hasBodyWrapper"
    v-show="props.bodyShow !== undefined ? props.bodyShow : true"
    :class="props.bodyClass"
    :style="wrapperStyle"
  >
    <template v-if="hasGrid">
      <div
        v-for="(child, index) in gridChildren"
        :key="nodeId(child) ?? `${resolvedChildKeyPrefix}-grid-${index}`"
        :class="props.itemClass"
        :style="getChildGridStyle(child)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
    </template>
    <template v-else>
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `${resolvedChildKeyPrefix}-${index}`"
        :config="child"
      />
    </template>
    <slot />
  </div>
  <template v-else>
    <template v-for="(child, index) in resolvedChildren" :key="nodeId(child) ?? `${resolvedChildKeyPrefix}-${index}`">
      <SparkComponentRenderer :config="child" />
    </template>
    <slot />
  </template>
</template>

<script setup lang="ts">
/**
 * 通用 host 载体：在当前子树建立 host 层级语义并按需注入能力与数据域。
 *
 * 与 el-form 的关系（三种模式）：
 * - r-form：el-form 由 RendererForm 自身提供，本组件运行在 el-form 内部（field-mode='form'，传入 row）。
 * - r-filter：el-form 由 RendererFieldScope 提供，本组件在 RendererFieldScope 外层作为 toolbar host。
 * - r-section / r-drawer / r-collapse：无 el-form，本组件直接承载字段（field-mode='detail'，不传 row）。
 * 本组件自身不含 el-form，DATA_ROW 仅在收到 row / slotScope 时才 provide。
 *
 * 主要职责：
 * 1. 按 fieldMode / variant 动态 provide HOST_FIELD_MODE / HOST_VARIANT。
 * 2. 按 actionHost 动态 provide ACTION_CAPABILITY（代理模式，避免 provide 泄漏）。
 * 3. 按 row / slotScope 有条件地 provide DATA_ROW（通过 rowMirror 同步，防止引用替换）。
 * 4. 渲染 children 子节点（也可用 slot 替代）。
 */
import { computed, shallowReactive, watch } from 'vue'
import type { StyleValue } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import { useContainerGrid } from '../layout/useContainerGrid'
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
import { resolveSlotScopeRow } from './rowScopeResolver.js'
import { syncReactiveRow } from '../../support/row-mirror-sync'

const EMPTY_DATA_ROW = Object.freeze({}) as IDataRow

const props = withDefaults(defineProps<{
  type?: string
  fieldMode?: string | undefined
  variant?: string | undefined
  actionHost?: SparkActionCapability | undefined
  row?: IDataRow | undefined
  slotScope?: Record<string, unknown> | undefined
  children?: SparkNode[] | undefined
  childKeyPrefix?: string | undefined
  /** body wrapper div 的 class */
  bodyClass?: string | string[] | Record<string, boolean> | undefined
  /** body wrapper div 的额外 style（非网格部分，与内部计算的 gridStyle 合并） */
  bodyStyle?: StyleValue | undefined
  /** v-show 条件（仅在有 body wrapper 时生效，undefined 表示始终显示） */
  bodyShow?: boolean | undefined
  /** 每个网格子项 wrapper div 的 class */
  itemClass?: string | undefined
  /** CSS Grid 列数，传入时激活内部网格布局 */
  gridColumns?: number | string | undefined
  /** 栅格间距 */
  gridGap?: number | string | undefined
  /** 栅格行高 */
  gridAutoRows?: string | undefined
  /** 自适应最小宽度 */
  autoFitMinWidth?: string | undefined
  /** 默认跨列数 */
  defaultColSpan?: number | undefined
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

const resolvedInputRow = computed<IDataRow | undefined>(() => {
  if (props.row !== undefined) return props.row
  if (props.slotScope === undefined) return undefined
  return resolveSlotScopeRow(props.slotScope, EMPTY_DATA_ROW)
})

watch(
  resolvedInputRow,
  (newRow) => {
    // 只有明确传入 row / slotScope 时才提供 DATA_ROW；
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

// ── body wrapper + grid 支持 ─────────────────────────────────────────────

const hasBodyWrapper = computed(() =>
  props.bodyClass !== undefined ||
  props.bodyStyle !== undefined ||
  props.gridColumns !== undefined ||
  props.bodyShow !== undefined,
)

const hasGrid = computed(() => props.gridColumns !== undefined)

const { gridStyle, gridChildren, getChildGridStyle } = useContainerGrid({
  children: resolvedChildren,
  columns: () => {
    const v = props.gridColumns
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const n = Number.parseInt(v, 10)
      return Number.isFinite(n) ? n : 24
    }
    return 24
  },
  gap: () => props.gridGap ?? 0,
  autoRows: () => props.gridAutoRows ?? 'minmax(32px, auto)',
  autoFitMinWidth: () => props.autoFitMinWidth ?? '',
  defaultColSpan: () => props.defaultColSpan ?? 24,
})

const wrapperStyle = computed<StyleValue | undefined>(() => {
  if (hasGrid.value && props.bodyStyle !== undefined) return [gridStyle.value, props.bodyStyle]
  if (hasGrid.value) return gridStyle.value
  return props.bodyStyle
})
</script>
