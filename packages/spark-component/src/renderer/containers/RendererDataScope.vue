<!--
/**
 * @skill r-data-scope
 * @description 通用数据作用域块容器 —— 向子组件注入 FIELD_CONTEXT / CONTEXT_DATA，
 *              直接对 children 循环 SparkComponentRenderer。
 * @provides FIELD_CONTEXT, CONTEXT_DATA
 */
-->
<template>
  <SparkComponentRenderer
    v-for="(child, i) in (children ?? [])"
    :key="child.id ?? `r-data-scope-${i}`"
    :config="child"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer } from '../_pkg'
import type { SparkNode } from '../_pkg'
import type { FieldContext } from '../_pkg'
import type { IDataRow } from '@spark-view/spark-data'
import { useDataScope } from './useDataScope'

interface Props {
  /** 子组件配置列表（直接循环渲染） */
  children?: SparkNode[]
  /** 数据行/节点/模型 */
  data: IDataRow
  /** 字段上下文类型 */
  fieldContext?: FieldContext
}

const props = withDefaults(defineProps<Props>(), {
  fieldContext: 'detail',
})

useDataScope({
  type: 'r-data-scope',
  fieldContext: computed(() => props.fieldContext),
  data: computed(() => props.data),
})
</script>
