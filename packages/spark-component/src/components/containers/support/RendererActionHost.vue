<template>
  <component v-if="resolvedHostTag" :is="resolvedHostTag" v-bind="resolvedHostAttrs">
    <template #default="scope">
      <component :is="resolvedWrapperTag" :class="props.wrapperClass">
        <RendererActionStrip
          :actions="getResolvedActions(scope)"
          :action-key-prefix="resolvedActionKeyPrefix"
          :slot-scope="getResolvedSlotScope(scope)"
        >
          <template #actions="actionScope">
            <slot name="actions" v-bind="actionScope" />
          </template>
        </RendererActionStrip>
      </component>
    </template>
  </component>
  <component v-else :is="resolvedWrapperTag" :class="props.wrapperClass">
    <RendererActionStrip
      :actions="resolvedActions"
      :action-key-prefix="resolvedActionKeyPrefix"
      :slot-scope="resolvedSlotScope"
    >
      <template #actions="scope">
        <slot name="actions" v-bind="scope" />
      </template>
    </RendererActionStrip>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SparkNode } from '../../internal'
import RendererActionStrip from './RendererActionStrip.vue'

const props = defineProps<{
  actions?: SparkNode[]
  actionKeyPrefix?: string
  slotScope?: object
  wrapperTag?: string
  wrapperClass?: unknown
  hostTag?: string
  hostAttrs?: Record<string, unknown>
  resolveActions?: (scope: Record<string, unknown>) => SparkNode[]
  resolveSlotScope?: (scope: Record<string, unknown>) => object
}>()

const resolvedActions = computed(() => props.actions ?? [])
const resolvedActionKeyPrefix = computed(() => props.actionKeyPrefix ?? 'renderer-action')
const resolvedSlotScope = computed(() => props.slotScope ?? {})
const resolvedHostAttrs = computed(() => props.hostAttrs ?? {})
const resolvedHostTag = computed(() => props.hostTag)
const resolvedWrapperTag = computed(() => props.wrapperTag ?? 'div')

function getResolvedActions(scope: Record<string, unknown>): SparkNode[] {
  return props.resolveActions ? props.resolveActions(scope) : resolvedActions.value
}

function getResolvedSlotScope(scope: Record<string, unknown>): object {
  return props.resolveSlotScope ? props.resolveSlotScope(scope) : resolvedSlotScope.value
}
</script>