<template>
  <template v-for="(child, index) in resolvedChildren" :key="nodeId(child) ?? `${resolvedChildKeyPrefix}-${index}`">
    <SparkComponentRenderer :config="child" />
  </template>
</template>

<script setup lang="ts">
/**
 * 动作上下文作用域 — 为行级动作子树同时注入行数据和宿主。
 *
 * 容器的行操作区使用此组件，将当前行数据（DATA_ROW）和宿主（context.host）
 * 一次性注入到动作按钮子树中。
 */
import { computed } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import { DATA_ROW, SparkComponentRenderer, nodeId, type SparkNode, type SparkComponentHost, useSparkComponent } from '../../internal'

const props = withDefaults(defineProps<{
  type?: 'r-action-context-scope'
  children?: SparkNode[]
  row?: IDataRow | undefined
  host?: SparkComponentHost | undefined
  childKeyPrefix?: string
}>(), {
  type: 'r-action-context-scope',
})

const { context, sparkProvide } = useSparkComponent({ type: props.type })

// @spark-design: host 通过 reactive 代理保持引用稳定，scope 内 host 随行变化
const currentHost = computed(() => props.host)
const hostProxy: SparkComponentHost = {
  get variant(): string | undefined {
    return currentHost.value?.variant
  },
  isDisabled(action) {
    return currentHost.value?.isDisabled?.(action) ?? false
  },
  execute(action) {
    currentHost.value?.execute?.(action)
  },
}

if (props.host !== undefined) {
  context.host = hostProxy
}

// DATA_ROW 是数据域能力键，组件层级 ≠ 数据层级时需通过能力键桥接
if (props.row !== undefined) {
  sparkProvide(DATA_ROW, props.row)
}

const resolvedChildren = computed(() => props.children ?? [])
const resolvedChildKeyPrefix = computed(() => props.childKeyPrefix ?? 'renderer-action-child')
</script>