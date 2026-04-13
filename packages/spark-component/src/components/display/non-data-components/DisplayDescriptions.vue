<template>
  <el-descriptions
    v-if="isVisible"
    :title="title"
    :extra="extra"
    :border="border"
    :column="column"
    :direction="direction"
    :size="descriptionsSize"
    v-bind="$attrs"
  >
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-descriptions-child-${index}`"
      :config="child"
    />
  </el-descriptions>
</template>

<script setup lang="ts">
/**
 * @skill r-descriptions
 * @description 描述列表容器，基于 el-descriptions 以键值对布局展示结构化信息。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { RDescriptionsProps } from './DisplayDescriptions.props'

const props = withDefaults(defineProps<RDescriptionsProps>(), {
  type: 'r-descriptions',
  border: false,
  column: 3,
  direction: 'horizontal',
  descriptionsSize: 'default',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
