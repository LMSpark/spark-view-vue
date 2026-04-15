<template>
  <div v-if="isVisible" :class="spaceClasses" :style="spaceStyle" v-bind="hostProps">
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-space-child-${index}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-space
 * @description 间距容器，使用 flex 布局为子组件提供均匀的水平或垂直间距，支持换行和填充。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { RSpaceProps } from './RendererSpace.props'



const props = withDefaults(defineProps<RSpaceProps>(), {
  type: 'r-space',
  direction: 'horizontal',
  size: 12,
  wrap: false,
  fill: false,
  alignment: 'center',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))

const spaceClasses = computed(() => [
  'r-space',
  `r-space--${props.direction}`,
  { 'r-space--wrap': props.wrap, 'r-space--fill': props.fill },
])

const gapValue = computed(() => {
  if (typeof props.size === 'number') return `${props.size}px`
  return props.size
})

const spaceStyle = computed(() => ({
  display: 'flex',
  flexDirection: props.direction === 'vertical' ? ('column' as const) : ('row' as const),
  gap: gapValue.value,
  flexWrap: props.wrap ? ('wrap' as const) : ('nowrap' as const),
  alignItems: props.alignment,
  ...(props.fill ? { width: '100%' } : {}),
}))
</script>

<style scoped>
.r-space--fill > * {
  flex: 1;
}
</style>

