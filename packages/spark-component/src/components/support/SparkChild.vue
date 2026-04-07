<template>
  <div v-if="shouldWrapGrid" class="spark-child-grid-item" :style="wrapperStyle">
    <SparkComponentRenderer :config="node" />
  </div>

  <SparkComponentRenderer v-else :config="node" />
</template>

<script setup lang="ts">
/**
 * @skill-description 子节点渲染包装器，渲染单个 SparkNode 子节点，支持 CSS Grid 项包装以兼容 el-table-column 嵌套。
 */
import { computed, getCurrentInstance, useAttrs, useSlots } from 'vue'
import type { CSSProperties } from 'vue'
import type { SparkNode } from '../../core/types.js'
import SparkComponentRenderer from '../SparkComponentRenderer.vue'
import {
  bindSparkChildType,
  buildTemplateNode,
  collectTemplateSlotBindings,
  normalizeSpan,
} from './SparkChild.shared.js'

defineOptions({
  name: 'SparkChild',
  inheritAttrs: false,
})

interface Props {
  type: string
  id?: string
  nodeId?: string
  colSpan?: number | string
  rowSpan?: number | string
}

const props = defineProps<Props>()
const attrs = useAttrs() as Record<string, unknown>
const slots = useSlots()

bindSparkChildType(getCurrentInstance()?.type ?? null)

const slotBindings = computed(() => {
  return collectTemplateSlotBindings(slots as unknown as Record<string, unknown>)
})

const node = computed<SparkNode>(() => {
  const rawNode = {
    ...attrs,
    type: props.type,
    ...(props.id !== undefined ? { id: props.id } : {}),
    ...(props.nodeId !== undefined ? { nodeId: props.nodeId } : {}),
    ...(props.colSpan !== undefined ? { colSpan: props.colSpan } : {}),
    ...(props.rowSpan !== undefined ? { rowSpan: props.rowSpan } : {}),
  }

  return buildTemplateNode(rawNode, {
    scope: `props:${props.type}`,
    slotChildren: slotBindings.value.defaultChildren,
    slotProps: slotBindings.value.namedSlotNodes,
  })
})

const wrapperStyle = computed<CSSProperties | undefined>(() => {
  const col = normalizeSpan(props.colSpan)
  const row = normalizeSpan(props.rowSpan)
  if (col === undefined && row === undefined) return undefined

  const style: CSSProperties = {}
  if (col !== undefined) style.gridColumn = `span ${col} / span ${col}`
  if (row !== undefined) style.gridRow = `span ${row} / span ${row}`
  return style
})

const shouldWrapGrid = computed(() => wrapperStyle.value !== undefined)
</script>