<template>
  <el-anchor-link
    v-if="isVisible"
    :href="href"
    :title="title"
    v-bind="$attrs"
  >
    <template v-if="!$slots['default']">{{ title }}</template>
    <slot />
    <template v-if="$slots['sub-link']" #sub-link>
      <slot name="sub-link" />
    </template>
  </el-anchor-link>
</template>

<script setup lang="ts">
/**
 * @skill r-anchor-link
 * @description 锚点链接项，基于 el-anchor-link 定义锚点 href 和显示标题，支持嵌套子链接。
 */
import { useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  /** 锚点链接 */
  href?: string
  /** 链接标题 */
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-anchor-link',
})

const { isVisible } = useSparkPageComponent(props)
</script>
