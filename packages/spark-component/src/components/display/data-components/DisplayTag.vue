<template>
  <el-tag
    v-if="isVisible"
    :type="resolvedTagType"
    :closable="closable"
    :disable-transitions="disableTransitions"
    :hit="hit"
    :round="round"
    :color="color"
    :size="size"
    :effect="effect"
    @close="handleClose"
  >
    {{ resolvedContent }}
  </el-tag>
</template>

<script setup lang="ts">
/**
 * @skill r-tag
 * @description 标签展示组件，支持类型/尺寸/主题样式和可关闭功能。
 */
import { computed } from 'vue'
import { useSparkPageComponent } from '../../internal'
import { useDisplayDataSource } from '../useDisplayDataSource'
import type { RTagProps, TagType } from './DisplayTag.props'

const TAG_TYPES = ['success', 'info', 'warning', 'danger'] as const

function normalizeTagType(value: unknown): TagType | undefined {
  if (typeof value !== 'string') return undefined
  return TAG_TYPES.includes(value as TagType) ? (value as TagType) : undefined
}



const props = withDefaults(defineProps<RTagProps>(), {
  type: 'r-tag',
  closable: false,
  disableTransitions: false,
  hit: false,
  round: false,
  size: 'default',
  effect: 'light',
})

const emit = defineEmits<{
  /** Tag close requested; 用户点击可关闭标签的关闭入口。 */
  close: []
}>()

const { isVisible } = useSparkPageComponent(props)
const { resolvedValue: dataValue } = useDisplayDataSource(props)

const resolvedContent = computed(() => {
  if (props.content !== undefined) return props.content
  const value = dataValue.value
  if (value !== undefined && value !== null) return String(value)
  return ''
})

const resolvedTagType = computed<TagType | undefined>(() => {
  const staticType = normalizeTagType(props.tagType)
  if (staticType) return staticType

  const sourceValue = props.value ?? dataValue.value ?? props.content ?? resolvedContent.value
  if (sourceValue === undefined || sourceValue === null) return undefined

  return normalizeTagType(props.dynamicType?.[String(sourceValue)])
})

function handleClose() {
  emit('close')
}
</script>

