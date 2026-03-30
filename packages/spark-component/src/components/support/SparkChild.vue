<template>
  <div v-if="shouldWrapGrid" class="spark-child-grid-item" :style="wrapperStyle">
    <SparkComponentRenderer :config="node" />
  </div>

  <SparkComponentRenderer v-else :config="node" />
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, useAttrs, useSlots } from 'vue'
import type { CSSProperties } from 'vue'
import type { SparkNode } from '../../core/types.js'
import SparkComponentRenderer from '../SparkComponentRenderer.vue'
import {
  bindSparkChildType,
  buildTemplateNode,
  collectTemplateSlotChildren,
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
  dock?: string
  order?: number
  colSpan?: number | string
  rowSpan?: number | string
}

const props = defineProps<Props>()
const attrs = useAttrs() as Record<string, unknown>
const slots = useSlots()

bindSparkChildType(getCurrentInstance()?.type ?? null)

const nestedChildren = computed(() => {
  return collectTemplateSlotChildren(slots as unknown as Record<string, unknown>)
})

const node = computed<SparkNode>(() => {
  const rawNode = {
    ...attrs,
    type: props.type,
    ...(props.id !== undefined ? { id: props.id } : {}),
    ...(props.nodeId !== undefined ? { nodeId: props.nodeId } : {}),
    ...(props.dock !== undefined ? { dock: props.dock } : {}),
    ...(props.order !== undefined ? { order: props.order } : {}),
    ...(props.colSpan !== undefined ? { colSpan: props.colSpan } : {}),
    ...(props.rowSpan !== undefined ? { rowSpan: props.rowSpan } : {}),
  }

  return buildTemplateNode(rawNode, {
    scope: `props:${props.type}`,
    slotChildren: nestedChildren.value,
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