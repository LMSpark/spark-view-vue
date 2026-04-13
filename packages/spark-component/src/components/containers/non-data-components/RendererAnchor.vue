<template>
  <el-anchor
    v-if="isVisible"
    :container="container"
    :offset="offset"
    :bound="bound"
    :duration="duration"
    :marker="marker"
    :direction="direction"
    :type="anchorType"
    v-bind="$attrs"
    @change="handleChange"
    @click="handleClick"
  >
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `r-anchor-child-${i}`"
      :config="child"
    />
  </el-anchor>
</template>

<script setup lang="ts">
/**
 * @skill r-anchor
 * @description 锚点导航容器，基于 el-anchor 提供页面内锚点定位和跟随滚动高亮。
 */
import { computed } from 'vue'
import {
  useSparkPageComponent,
  SparkComponentRenderer,
  getSparkNodeChildren,
  nodeId,
} from '../../internal'
import type { RAnchorProps } from './RendererAnchor.props'



const props = withDefaults(defineProps<RAnchorProps>(), {
  type: 'r-anchor',
  offset: 0,
  bound: 15,
  duration: 300,
  marker: true,
  direction: 'vertical',
  anchorType: 'default',
})

const emit = defineEmits<{
  change: [href: string]
  click: [e: MouseEvent, href?: string]
}>()

const { isVisible } = useSparkPageComponent(props)

const children = computed(() => getSparkNodeChildren(props.children))

function handleChange(href: string) {
  emit('change', href)
}

function handleClick(e: MouseEvent, href?: string) {
  emit('click', e, href)
}
</script>
