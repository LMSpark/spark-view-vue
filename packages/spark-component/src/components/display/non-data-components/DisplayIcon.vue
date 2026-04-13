<template>
  <el-icon v-if="isVisible" :size="iconSize" :color="color" v-bind="$attrs">
    <component :is="resolvedIconComponent" v-if="resolvedIconComponent" />
  </el-icon>
</template>

<script setup lang="ts">
/**
 * @skill display-icon
 * @description 图标展示组件，解析图标名称渲染为 Element Plus 图标组件，支持尺寸和颜色配置。
 */
import { computed, markRaw, type Component } from 'vue'
import * as ElIcons from '@element-plus/icons-vue'
import { useSparkPageComponent } from '../../internal'
import type { RDisplayIconProps } from './DisplayIcon.props'

const props = withDefaults(defineProps<RDisplayIconProps>(), {
  type: 'display-icon',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedIconComponent = computed((): Component | null => {
  if (!props.icon) return null
  const icons = ElIcons as Record<string, Component>
  const comp = icons[props.icon]
  return comp ? markRaw(comp) : null
})
</script>
