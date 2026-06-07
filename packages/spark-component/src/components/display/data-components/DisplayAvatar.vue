<template>
  <el-avatar
    v-if="isVisible"
    :size="avatarSize"
    :shape="shape"
    :icon="iconComponent"
    :src="resolvedSrc"
    :src-set="srcSet"
    :alt="alt"
    :fit="fit"
  >
    <template v-if="text">{{ text }}</template>
  </el-avatar>
</template>

<script setup lang="ts">
/**
 * @description 头像展示组件，支持图片/图标/文字多种模式和尺寸配置。
 */
import { computed } from 'vue'
import { useSparkPageComponent } from '../../internal'
import { useDisplayDataSource } from '../useDisplayDataSource'
import type { RAvatarProps } from './DisplayAvatar.props'

const props = withDefaults(defineProps<RAvatarProps>(), {
  type: 'r-avatar',
  avatarSize: 'default',
  shape: 'circle',
  fit: 'cover',
})

const { isVisible } = useSparkPageComponent(props)

const { resolvedValue: dataValue } = useDisplayDataSource(props)

const resolvedSrc = computed(() => {
  if (props.src) return props.src
  const v = dataValue.value
  if (typeof v === 'string') return v
  return undefined
})

const iconComponent = computed(() => {
  // el-avatar accepts Component or undefined for icon prop
  // In SparkNode config mode, we skip icon components
  return undefined
})
</script>


