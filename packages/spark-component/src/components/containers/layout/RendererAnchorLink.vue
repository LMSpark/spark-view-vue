<template>
  <el-anchor-link
    v-if="isVisible"
    :href="href"
    :title="title"
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
 * @description 锚点链接项，支持嵌套子链接。
 */
import { useSparkPageComponent } from '../../internal'
import type { RAnchorLinkProps } from './RendererAnchorLink.props'



const props = withDefaults(defineProps<RAnchorLinkProps>(), {
  type: 'r-anchor-link',
})

const { isVisible } = useSparkPageComponent(props)
</script>


