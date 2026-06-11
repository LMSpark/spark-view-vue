<!--
@module @spark-appworks/spark-component:components/display/non-data-components/DisplayTimeline
DisplayTimeline 模块，属于 SPARK component display/static-display。
组件目录: display/non-data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
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


