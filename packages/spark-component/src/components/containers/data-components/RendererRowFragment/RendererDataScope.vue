<!--
/**
 * @skill r-data-scope
 * @description 通用数据作用域块容器 —— 向子组件注入 DATA_ROW，
 *              字段语义由祖先 context.type 推断，子节点递归交由 RendererDataHost 承接。
 * @provides DATA_ROW
 */
-->
<template>
  <RendererDataHost :children="renderChildren" child-key-prefix="r-data-scope" />
</template>

<script setup lang="ts">
/**
 * @skill-description 数据作用域容器，透明地向子组件注入 DATA_ROW 上下文，不产生额外 DOM 包装。
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