<template>
  <template v-for="(child, index) in resolvedChildren" :key="nodeId(child) ?? `${resolvedChildKeyPrefix}-${index}`">
    <SparkComponentRenderer :config="child" />
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, nodeId, type SparkNode } from '../../../internal'

const props = defineProps<{
  children?: SparkNode[]
  childKeyPrefix?: string
}>()

const resolvedChildren = computed(() => props.children ?? [])
const resolvedChildKeyPrefix = computed(() => props.childKeyPrefix ?? 'renderer-data-child')
</script>