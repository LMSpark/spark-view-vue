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
 * @skill r-descriptions-item
 * @description 描述列表项，基于 el-descriptions-item 定义标签和内容值，支持字段绑定。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import { useDisplayDataSource } from '../useDisplayDataSource'
import type { RDescriptionsItemProps } from './DisplayDescriptionsItem.props'

const props = withDefaults(defineProps<RDescriptionsItemProps>(), {
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
