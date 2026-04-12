<template>
  <el-empty
    v-if="isVisible"
    :image="image"
    :image-size="imageSize"
    :description="description"
    v-bind="$attrs"
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
 * @description 空状态占位组件，基于 el-empty 显示自定义空状态图片和描述文字。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'
import type { SparkRuntimeChildrenProps } from '../../shared-types.js'

interface Props extends SparkRuntimeChildrenProps<'r-empty'> {
  children?: SparkNode[]
  image?: string
  imageSize?: number
  description?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-empty',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
