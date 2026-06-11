<!--
@module @spark-appworks/spark-component:components/display/non-data-components/DisplaySkeleton
DisplaySkeleton 模块，属于 SPARK component display/static-display。
组件目录: display/non-data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <el-skeleton
    v-if="isVisible"
    :rows="rows"
    :count="count"
    :loading="loading"
    :animated="animated"
    :throttle="throttle"
  >
    <template v-if="resolvedChildren.length" #default>
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-skeleton-child-${index}`"
        :config="child"
      />
    </template>
  </el-skeleton>
</template>

<script setup lang="ts">
/**
 * @description 骨架屏加载占位组件。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { RSkeletonProps } from './DisplaySkeleton.props'

const props = withDefaults(defineProps<RSkeletonProps>(), {
  type: 'r-skeleton',
  rows: 3,
  count: 1,
  loading: true,
  animated: false,
  throttle: 0,
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>


