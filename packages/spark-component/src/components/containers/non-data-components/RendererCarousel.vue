<template>
  <el-carousel
    v-if="isVisible"
    :height="height"
    :initial-index="initialIndex"
    :trigger="trigger"
    :autoplay="autoplay"
    :interval="interval"
    :indicator-position="indicatorPosition"
    :arrow="arrow"
    :loop="loop"
    :direction="direction"
    :pause-on-hover="pauseOnHover"
    :motion-blur="motionBlur"
    v-bind="$attrs"
  >
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-carousel-child-${index}`"
      :config="child"
    />
  </el-carousel>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  height?: string
  initialIndex?: number
  trigger?: 'hover' | 'click'
  autoplay?: boolean
  interval?: number
  indicatorPosition?: '' | 'none' | 'outside'
  arrow?: 'always' | 'hover' | 'never'
  loop?: boolean
  direction?: 'horizontal' | 'vertical'
  pauseOnHover?: boolean
  motionBlur?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-carousel',
  height: '200px',
  initialIndex: 0,
  trigger: 'hover',
  autoplay: true,
  interval: 3000,
  indicatorPosition: '',
  arrow: 'hover',
  loop: true,
  direction: 'horizontal',
  pauseOnHover: true,
  motionBlur: false,
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
