<template>
  <el-tag
    v-if="isVisible"
    v-bind="mergedAttrs"
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
 * @description 标签展示组件，基于 el-tag 以彩色标签显示字段值，支持类型/尺寸/主题样式和可关闭功能。
 */
import { computed, useAttrs } from 'vue'
import { useSparkPageComponent } from '../../internal'
import { useDisplayDataSource } from '../useDisplayDataSource'
import type { SparkRuntimeProps } from '../../shared-types.js'

const TAG_TYPES = ['success', 'info', 'warning', 'danger'] as const
type TagType = (typeof TAG_TYPES)[number]

function normalizeTagType(value: unknown): TagType | undefined {
  if (typeof value !== 'string') return undefined
  return TAG_TYPES.includes(value as TagType) ? (value as TagType) : undefined
}

interface Props extends SparkRuntimeProps<'r-tag'> {
  content?: string
  value?: string
  field?: string
  tagType?: '' | TagType
  dynamicType?: Record<string, '' | TagType>
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

const attrs = useAttrs()
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

const mergedAttrs = computed<Record<string, unknown>>(() => {
  const nextAttrs = { ...attrs } as Record<string, unknown>
  if (resolvedTagType.value !== undefined) nextAttrs['type'] = resolvedTagType.value
  return nextAttrs
})

function handleClose() {
  emit('close')
}
</script>