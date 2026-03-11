<template>
  <SparkComponentRenderer v-if="config" :config="scopedConfig" />
  <slot v-else />
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import type { IDataSource } from '@spark-view/spark-data'
import { DATA_SOURCE } from '@spark-view/spark-component'
import { FIELD_CONTEXT, CONTEXT_DATA } from '@spark-view/spark-component'

interface Props {
  config?: ComponentConfig
  data: Record<string, unknown>
  node?: unknown
  dataSource?: IDataSource | null
}

const props = defineProps<Props>()

const { provide: sparkProvide } = useSparkComponent({ type: 'r-tree-node-scope' })

sparkProvide(FIELD_CONTEXT, 'tree')

watch(() => props.data, (data) => {
  sparkProvide(CONTEXT_DATA, data)
}, { immediate: true })

watch(() => props.dataSource, (dataSource) => {
  if (dataSource) {
    sparkProvide(DATA_SOURCE, dataSource)
  }
}, { immediate: true })

const scopedConfig = computed<ComponentConfig>(() => ({
  ...(props.config ?? { type: 'div' }),
  props: {
    ...(props.config?.props ?? {}),
  },
}))
</script>