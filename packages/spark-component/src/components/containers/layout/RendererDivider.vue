<template>
  <el-divider
    v-if="isVisible"
    :direction="direction"
    :border-style="borderStyle"
    :content-position="contentPosition"
  >
    <template v-if="content">{{ content }}</template>
  </el-divider>
</template>

<script setup lang="ts">
/**
 * @description 分割线组件，支持文字内容定位。
 */
import { useSparkPageComponent } from '../../internal'
import type { RDividerProps } from './RendererDivider.props'



const props = withDefaults(defineProps<RDividerProps>(), {
  type: 'r-divider',
  direction: 'horizontal',
  borderStyle: 'solid',
  contentPosition: 'center',
})

const { isVisible } = useSparkPageComponent(props)
</script>


