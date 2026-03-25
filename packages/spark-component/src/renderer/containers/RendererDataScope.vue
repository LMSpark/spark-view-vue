<!--
/**
 * @skill r-data-scope
 * @description 通用数据作用域块容器 —— 向子组件注入 CONTEXT_DATA，
 *              字段语义由祖先 context.type 推断，直接对 children 循环 SparkComponentRenderer。
 * @provides CONTEXT_DATA
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
import { computed } from 'vue'
import { SparkComponentRenderer } from '../_pkg'
import { getSparkNodeChildren, nodeId, type SparkNode } from '../_pkg'
import type { IDataRow } from '@spark-view/spark-data'
import { useDataScope } from './useDataScope'

interface Props extends SparkNode {
  /** 数据行/节点/模型 */
  data: IDataRow
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-data-scope',
})
const componentType = computed(() => props.type ?? 'r-data-scope')

const renderChildren = computed<SparkNode[]>(() => getSparkNodeChildren(props.children))

useDataScope({
  type: componentType.value,
  nodeConfig: {
    type: componentType.value,
    ...(props.id !== undefined ? { id: props.id } : {}),
    ...(props.dock !== undefined ? { dock: props.dock } : {}),
    ...(props.order !== undefined ? { order: props.order } : {}),
    ...(props.children !== undefined ? { children: props.children } : {}),
    ...(props.props !== undefined ? { props: props.props } : {}),
  },
  data: computed(() => props.data),
})
</script>
