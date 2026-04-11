<template>
  <RendererRowFragmentHost v-bind="hostProps" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getSparkNodeChildren, type SparkNode } from '../../../internal'
import RendererRowFragmentHost from './RendererRowFragmentHost.vue'
import type { RendererRowFragmentProps as Props } from './RendererRowFragment.types.js'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-row-fragment',
})

const renderChildren = computed<SparkNode[]>(() => {
  const fieldNodes = getSparkNodeChildren(props.fields)
  if (fieldNodes.length > 0) return fieldNodes
  return getSparkNodeChildren(props.children)
})
const hostProps = computed<Props>(() => ({
  type: props.type,
  ...(props.id !== undefined ? { id: props.id } : {}),
  ...(props.title !== undefined ? { title: props.title } : {}),
  ...(props.label !== undefined ? { label: props.label } : {}),
  ...(props.description !== undefined ? { description: props.description } : {}),
  ...(props.width !== undefined ? { width: props.width } : {}),
  ...(props.minWidth !== undefined ? { minWidth: props.minWidth } : {}),
  ...(props.align !== undefined ? { align: props.align } : {}),
  ...(props.headerAlign !== undefined ? { headerAlign: props.headerAlign } : {}),
  ...(props.class !== undefined ? { class: props.class } : {}),
  ...(props.data !== undefined ? { data: props.data } : {}),
  ...(props.fields !== undefined ? { fields: props.fields } : {}),
  children: renderChildren.value,
}))
</script>