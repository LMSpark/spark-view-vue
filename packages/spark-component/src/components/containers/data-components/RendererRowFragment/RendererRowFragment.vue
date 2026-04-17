<template>
  <!--
    行片段仅负责作用域转发：
    - 上游若传 slotScope，则交由 RendererHostScope 解析 DATA_ROW；
    - 上游若传 data，则直接作为 DATA_ROW。
  -->
  <RendererHostScope
    type="r-data-scope"
    :row="resolvedDataInput"
    :slot-scope="props.slotScope"
    :children="resolvedChildren"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import { getSparkNodeChildren, type SparkNode } from '../../../internal'
import RendererHostScope from '../../support/RendererHostScope.vue'
import type { RendererRowFragmentProps as Props } from './RendererRowFragment.types.js'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-row-fragment',
})

// ===== 子节点解析 =====

// fields 优先级高于 children：fields 作为显式"字段列表"语义；children 作为兜底通用子节点。
const resolvedChildren = computed<SparkNode[]>(() => {
  const fieldNodes = getSparkNodeChildren(props.fields)
  if (fieldNodes.length > 0) return fieldNodes
  return getSparkNodeChildren(props.children)
})

// ===== 行数据输入 =====

// 冻结空对象作为"无数据"语义，避免子字段因 undefined 而崩溃，同时防止意外写入。
const EMPTY_DATA_ROW = Object.freeze({}) as IDataRow

// data 有值时直传；仅 slotScope 场景交由 HostScope 内部解析；两者都缺省时回退空行。
const resolvedDataInput = computed<IDataRow | undefined>(() => {
  if (props.data !== undefined) return props.data
  if (props.slotScope !== undefined) return undefined
  return EMPTY_DATA_ROW
})
</script>