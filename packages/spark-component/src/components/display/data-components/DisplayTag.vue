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
import { computed } from 'vue'
import { useSparkPageComponent, type SparkNode } from '../../internal'
import { useDisplayDataSource } from '../composables/useDisplayDataSource'

interface Props extends SparkNode {
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
