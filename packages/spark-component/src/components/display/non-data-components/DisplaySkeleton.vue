<template>
  <el-skeleton
    v-if="isVisible"
    :rows="rows"
    :count="count"
    :loading="loading"
    :animated="animated"
    :throttle="throttle"
    v-bind="$attrs"
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
 * @skill-description 骨架屏加载占位组件，基于 el-skeleton 显示内容加载中的占位动画效果。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'
import type { SparkRuntimeChildrenProps } from '../../shared-types.js'

interface Props extends SparkRuntimeChildrenProps<'r-skeleton'> {
  children?: SparkNode[]
  rows?: number
  count?: number
  loading?: boolean
  animated?: boolean
  throttle?: number
}

const props = withDefaults(defineProps<Props>(), {
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
