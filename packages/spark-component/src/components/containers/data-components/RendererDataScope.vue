<!--
/**
 * @skill r-data-scope
 * @description 通用数据作用域块容器 —— 向子组件注入 DATA_ROW，
 *              字段语义由祖先 context.type 推断，直接对 children 循环 SparkComponentRenderer。
 * @provides DATA_ROW
 */
-->
<template>
  <SparkComponentRenderer
    v-for="(child, i) in renderChildren"
    :key="nodeId(child) ?? `r-data-scope-${i}`"
    :config="child"
  />
</template>

<script setup lang="ts">
/**
 * @skill-description 数据作用域容器，透明地向子组件注入 DATA_ROW 上下文，不产生额外 DOM 包装。
 */
import { computed } from 'vue'
import { SparkComponentRenderer } from '../../internal'
import { getSparkNodeChildren, nodeId, type SparkNode } from '../../internal'
import type { IDataRow } from '@spark-view/spark-data'
import { useDataScope } from '../context/useDataScope'

interface Props extends SparkNode {
  /** 数据行/节点/模型 */
  data: IDataRow
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

