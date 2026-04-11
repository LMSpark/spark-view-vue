<template>
  <template v-for="(action, index) in props.actions" :key="nodeId(action) ?? `${resolvedActionKeyPrefix}-${index}`">
    <SparkComponentRenderer :config="action" />
  </template>
  <slot name="actions" v-bind="resolvedSlotScope" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, nodeId, type SparkNode } from '../../internal'

const props = defineProps<{
  actions: SparkNode[]
  actionKeyPrefix?: string
  slotScope?: object
}>()

const resolvedActionKeyPrefix = computed(() => props.actionKeyPrefix ?? 'renderer-action')
const resolvedSlotScope = computed(() => props.slotScope ?? {})
</script>