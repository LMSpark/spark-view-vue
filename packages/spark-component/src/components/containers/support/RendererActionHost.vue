<template>
  <component v-if="resolvedHostTag" :is="resolvedHostTag" v-bind="resolvedHostAttrs">
    <template #default="scope">
      <component :is="resolvedWrapperTag" :class="props.wrapperClass">
        <RendererActionContextScope
          v-if="hasResolvedContext(scope)"
          :children="getResolvedActions(scope)"
          :row="getResolvedRow(scope)"
          :host="getResolvedHost(scope)"
          :child-key-prefix="resolvedActionKeyPrefix"
        />
        <template v-else v-for="(action, index) in getResolvedActions(scope)" :key="nodeId(action) ?? `${resolvedActionKeyPrefix}-${index}`">
          <SparkComponentRenderer :config="action" />
        </template>
        <slot name="actions" v-bind="getResolvedSlotScope(scope)" />
      </component>
    </template>
  </component>
  <component v-else :is="resolvedWrapperTag" :class="props.wrapperClass">
    <RendererActionContextScope
      v-if="hasStaticContext"
      :children="resolvedActions"
      :row="props.row"
      :host="props.host"
      :child-key-prefix="resolvedActionKeyPrefix"
    />
    <template v-else v-for="(action, index) in resolvedActions" :key="nodeId(action) ?? `${resolvedActionKeyPrefix}-${index}`">
      <SparkComponentRenderer :config="action" />
    </template>
    <slot name="actions" v-bind="resolvedSlotScope" />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import { SparkComponentRenderer, nodeId, type SparkNode, type SparkComponentHost } from '../../internal'
import RendererActionContextScope from './RendererActionContextScope.vue'

const props = defineProps<{
  actions?: SparkNode[]
  row?: IDataRow
  host?: SparkComponentHost
  actionKeyPrefix?: string
  slotScope?: object
  wrapperTag?: string
  wrapperClass?: unknown
  hostTag?: string
  hostAttrs?: Record<string, unknown>
  resolveActions?: (scope: Record<string, unknown>) => SparkNode[]
  resolveRow?: (scope: Record<string, unknown>) => IDataRow | undefined
  resolveHost?: (scope: Record<string, unknown>) => SparkComponentHost | undefined
  resolveSlotScope?: (scope: Record<string, unknown>) => object
}>()

const resolvedActions = computed(() => props.actions ?? [])
const resolvedActionKeyPrefix = computed(() => props.actionKeyPrefix ?? 'renderer-action')
const resolvedSlotScope = computed(() => props.slotScope ?? {})
const resolvedHostAttrs = computed(() => props.hostAttrs ?? {})
const resolvedHostTag = computed(() => props.hostTag)
const resolvedWrapperTag = computed(() => props.wrapperTag ?? 'div')
const hasStaticContext = computed(() => props.row !== undefined || props.host !== undefined)

function getResolvedActions(scope: Record<string, unknown>): SparkNode[] {
  return props.resolveActions ? props.resolveActions(scope) : resolvedActions.value
}

function getResolvedRow(scope: Record<string, unknown>): IDataRow | undefined {
  return props.resolveRow ? props.resolveRow(scope) : props.row
}

function getResolvedHost(scope: Record<string, unknown>): SparkComponentHost | undefined {
  return props.resolveHost ? props.resolveHost(scope) : props.host
}

function hasResolvedContext(scope: Record<string, unknown>): boolean {
  return getResolvedRow(scope) !== undefined || getResolvedHost(scope) !== undefined
}

function getResolvedSlotScope(scope: Record<string, unknown>): object {
  return props.resolveSlotScope ? props.resolveSlotScope(scope) : resolvedSlotScope.value
}
</script>