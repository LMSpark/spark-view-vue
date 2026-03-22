<template>
  <SparkComponentRenderer v-if="config" :config="scopedConfig" />
  <slot v-else />
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../_pkg'
import type { SparkNode } from '../_pkg'
import type { IDataSource } from '@spark-view/spark-data'
import { DATA_SOURCE } from '../_pkg'
import { FIELD_CONTEXT, CONTEXT_DATA } from '../_pkg'

interface Props {
  /** SPARK 配置驱动 */
  config?: SparkNode
  /** 树节点数据 */
  data: Record<string, unknown>
  /** el-tree 节点对象 */
  node?: unknown
  /** 父级数据源 */
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

const scopedConfig = computed<SparkNode>(() => ({
  ...(props.config ?? { type: 'div' }),
  props: {
    ...(props.config?.props ?? {}),
  },
}))
</script>