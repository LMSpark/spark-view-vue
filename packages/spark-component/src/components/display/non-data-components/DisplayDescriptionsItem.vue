<template>
  <el-descriptions-item
    v-if="isVisible"
    :label="label"
    :span="span"
    :label-align="labelAlign"
    :align="contentAlign"
    :label-class-name="labelClassName"
    :class-name="className"
    v-bind="$attrs"
  >
    <template v-if="resolvedChildren.length > 0">
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-desc-item-child-${index}`"
        :config="child"
      />
    </template>
    <template v-else>{{ resolvedContent }}</template>
  </el-descriptions-item>
</template>

<script setup lang="ts">
/**
 * @skill-description 描述列表项，基于 el-descriptions-item 定义标签和内容值，支持字段绑定。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'
import { useDisplayDataSource } from '../composables/useDisplayDataSource'

interface Props extends SparkNode {
  children?: SparkNode[]
  label?: string
  span?: number
  labelAlign?: 'left' | 'center' | 'right'
  contentAlign?: 'left' | 'center' | 'right'
  labelClassName?: string
  className?: string
  content?: string
  value?: unknown
  field?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-descriptions-item',
  span: 1,
})

const { isVisible } = useSparkPageComponent(props)

const { resolvedValue: dataValue } = useDisplayDataSource(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))

const resolvedContent = computed(() => {
  if (props.content !== undefined) return props.content
  const v = dataValue.value
  if (v !== undefined && v !== null) return String(v)
  return ''
})
</script>
