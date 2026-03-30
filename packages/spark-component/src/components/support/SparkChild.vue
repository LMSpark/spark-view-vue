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
  collectBusinessProps,
  collectTemplateChildren,
  hasLegacyChildrenInput,
  normalizeSpan,
  resolveNodeId,
  warnIgnoredChildrenInput,
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
  return collectTemplateChildren(slots['default']?.())
})

const node = computed<SparkNode>(() => {
  if (hasLegacyChildrenInput(attrs['children'])) {
    warnIgnoredChildrenInput('props', props.type)
  }

  const businessProps = collectBusinessProps(attrs)
  if (props.colSpan !== undefined) businessProps['colSpan'] = props.colSpan
  if (props.rowSpan !== undefined) businessProps['rowSpan'] = props.rowSpan

  const nextNode: SparkNode = { type: props.type, props: businessProps }
  const resolvedId = resolveNodeId({ id: props.id, nodeId: props.nodeId }, `props:${props.type}`)
  if (resolvedId !== undefined) nextNode.id = resolvedId
  if (props.dock !== undefined) nextNode.dock = props.dock
  if (props.order !== undefined) nextNode.order = props.order
  if (nestedChildren.value.length > 0) nextNode.children = nestedChildren.value

  return nextNode
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