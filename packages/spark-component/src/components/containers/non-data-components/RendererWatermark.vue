<template>
  <el-watermark
    v-if="isVisible"
    :content="content"
    :font="font"
    :gap="gap"
    :offset="offset"
    :rotate="rotate"
    :z-index="zIndex"
    :width="width"
    :height="height"
    v-bind="$attrs"
  >
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-watermark-child-${index}`"
      :config="child"
    />
  </el-watermark>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface WatermarkFont {
  color?: string
  fontSize?: number
  fontWeight?: string
  fontFamily?: string
  fontStyle?: string
  textAlign?: string
}

interface Props extends SparkNode {
  children?: SparkNode[]
  content?: string | string[]
  font?: WatermarkFont
  gap?: [number, number]
  offset?: [number, number]
  rotate?: number
  zIndex?: number
  width?: number
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-watermark',
  rotate: -22,
  zIndex: 9,
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
