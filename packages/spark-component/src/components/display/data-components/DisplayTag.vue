<template>
  <el-tag
    v-if="isVisible"
    :type="tagType"
    :closable="closable"
    :disable-transitions="disableTransitions"
    :hit="hit"
    :round="round"
    :color="color"
    :size="size"
    :effect="effect"
    v-bind="$attrs"
    @close="handleClose"
  >
    {{ resolvedContent }}
  </el-tag>
</template>

<script setup lang="ts">
/**
 * @skill r-tag
 * @description 标签展示组件，基于 el-tag 以彩色标签显示字段值，支持类型/尺寸/主题样式和可关闭功能。
 */
import { computed } from 'vue'
import { useSparkPageComponent } from '../../internal'
import { useDisplayDataSource } from '../useDisplayDataSource'
import type { SparkRuntimeProps } from '../../shared-types.js'

interface Props extends SparkRuntimeProps<'r-tag'> {
  content?: string
  value?: string
  field?: string
  tagType?: '' | 'success' | 'info' | 'warning' | 'danger'
  closable?: boolean
  disableTransitions?: boolean
  hit?: boolean
  round?: boolean
  color?: string
  size?: 'large' | 'default' | 'small'
  effect?: 'dark' | 'light' | 'plain'
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-tag',
  tagType: '',
  closable: false,
  disableTransitions: false,
  hit: false,
  round: false,
  size: 'default',
  effect: 'light',
})

const emit = defineEmits<{
  close: []
}>()

const { isVisible } = useSparkPageComponent(props)

const { resolvedValue: dataValue } = useDisplayDataSource(props)

const resolvedContent = computed(() => {
  if (props.content !== undefined) return props.content
  const v = dataValue.value
  if (v !== undefined && v !== null) return String(v)
  return ''
})

function handleClose() {
  emit('close')
}
</script>
