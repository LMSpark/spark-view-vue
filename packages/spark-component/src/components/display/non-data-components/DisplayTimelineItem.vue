<template>
  <el-timeline-item
    v-if="isVisible"
    :timestamp="timestamp"
    :hide-timestamp="hideTimestamp"
    :center="center"
    :placement="placement"
    :type="itemType"
    :color="color"
    :size="itemSize"
    :hollow="hollow"
    v-bind="hostProps"
  >
    <template v-if="resolvedChildren.length > 0">
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-timeline-item-child-${index}`"
        :config="child"
      />
    </template>
    <template v-else>{{ content }}</template>
  </el-timeline-item>
</template>

<script setup lang="ts">
/**
 * @skill r-timeline-item
 * @description 时间线项。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { RTimelineItemProps } from './DisplayTimelineItem.props'

const props = withDefaults(defineProps<RTimelineItemProps>(), {
  type: 'r-timeline-item',
  hideTimestamp: false,
  center: false,
  placement: 'bottom',
  itemType: 'primary',
  itemSize: 'normal',
  hollow: false,
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>


