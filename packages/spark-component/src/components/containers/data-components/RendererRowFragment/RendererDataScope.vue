<template>
  <RendererDataHost :children="renderChildren" child-key-prefix="r-data-scope" />
</template>

<script setup lang="ts">
/**
 * @skill r-data-scope
 * @description 数据作用域容器，透明地向子组件注入 DATA_ROW 上下文，不产生额外 DOM 包装。
 * @category internal
 */
import { computed } from 'vue'
import { getSparkNodeChildren, type SparkNode } from '../../../internal'
import { useDataScope } from '../../context/useDataScope'
import type { IDataRow } from '@spark-view/spark-data'
import RendererDataHost from './RendererDataHost.vue'

interface Props extends Omit<SparkNode, 'type' | 'children'> {
  type?: 'r-data-scope'
  id?: string
  data: IDataRow
  children?: SparkNode[]
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-data-scope',
})
const renderChildren = computed<SparkNode[]>(() => getSparkNodeChildren(props.children))

useDataScope({
  type: props.type,
  nodeConfig: {
    type: props.type,
    ...(props.id !== undefined ? { id: props.id } : {}),
  },
  data: computed(() => props.data),
})
</script>