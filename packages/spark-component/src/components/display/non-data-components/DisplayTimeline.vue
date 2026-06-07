<template>
  <el-timeline v-if="isVisible">
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-timeline-child-${index}`"
      :config="child"
    />
  </el-timeline>
</template>

<script setup lang="ts">
/**
 * @description 时间线容器。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { RTimelineProps } from './DisplayTimeline.props'

const props = withDefaults(defineProps<RTimelineProps>(), {
  type: 'r-timeline',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>


