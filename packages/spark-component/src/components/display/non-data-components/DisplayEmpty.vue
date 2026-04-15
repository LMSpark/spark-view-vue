<template>
  <el-empty
    v-if="isVisible"
    :image="image"
    :image-size="imageSize"
    :description="description"
    v-bind="hostProps"
  >
    <template v-if="resolvedChildren.length > 0">
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-empty-child-${index}`"
        :config="child"
      />
    </template>
  </el-empty>
</template>

<script setup lang="ts">
/**
 * @skill r-empty
 * @description 空状态占位组件。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { REmptyProps } from './DisplayEmpty.props'

const props = withDefaults(defineProps<REmptyProps>(), {
  type: 'r-empty',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>


