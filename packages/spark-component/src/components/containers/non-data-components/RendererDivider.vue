<template>
  <el-divider
    v-if="isVisible"
    :direction="direction"
    :border-style="borderStyle"
    :content-position="contentPosition"
    v-bind="$attrs"
  >
    <template v-if="content">{{ content }}</template>
  </el-divider>
</template>

<script setup lang="ts">
/**
 * @skill-description 分割线组件，基于 el-divider 在布局中插入水平或垂直分隔，支持文字内容定位。
 */
import { useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  direction?: 'horizontal' | 'vertical'
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none'
  contentPosition?: 'left' | 'center' | 'right'
  content?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-divider',
  direction: 'horizontal',
  borderStyle: 'solid',
  contentPosition: 'center',
})

const { isVisible } = useSparkPageComponent(props)
</script>
