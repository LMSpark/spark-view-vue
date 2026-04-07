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
 * @skill-description 锚点导航容器，基于 el-anchor 提供页面内锚点定位和跟随滚动高亮。
 */
import { computed } from 'vue'
import {
  useSparkPageComponent,
  SparkComponentRenderer,
  getSparkNodeChildren,
  nodeId,
  type SparkNode,
} from '../../internal'

interface Props extends SparkNode {
  /** 滚动容器选择器 */
  container?: string
  /** 偏移量 */
  offset?: number
  /** 边界值 */
  bound?: number
  /** 滚动动画时长 */
  duration?: number
  /** 是否显示标记 */
  marker?: boolean
  /** 排列方向 */
  direction?: 'vertical' | 'horizontal'
  /** 锚点类型（避免与 SparkNode.type 冲突） */
  anchorType?: 'default' | 'underline'
}

const props = withDefaults(defineProps<Props>(), {
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
