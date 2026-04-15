<template>
  <slot />
</template>

<script setup lang="ts">
/**
 * 宿主作用域 — 在子树中建立一个新的宿主上下文。
 *
 * 容器组件用此包装工具栏等子区域，子组件通过 findNearestHost() 可找到此宿主。
 */
import { useSparkComponent, type SparkComponentHost } from '../../internal'

const props = withDefaults(defineProps<{
  type?: 'r-host-scope'
  host: SparkComponentHost
}>(), {
  type: 'r-host-scope',
})

const { host } = useSparkComponent({ type: props.type })

host.setHost(props.host)
</script>