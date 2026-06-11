<!--
@module @spark-appworks/spark-component:components/display/data-components/DisplayBadge
DisplayBadge 模块，属于 SPARK component display/data-display。
组件目录: display/data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <el-badge
    v-if="isVisible"
    :value="resolvedBadgeValue"
    :max="max"
    :is-dot="isDot"
    :hidden="hiddenBadge"
    :type="badgeType"
    :show-zero="showZero"
    :color="color"
    :offset="offset"
    :badge-style="badgeStyle"
    :badge-class="badgeClass"
  >
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-badge-child-${index}`"
      :config="child"
    />
  </el-badge>
</template>

<script setup lang="ts">
/**
 * @description 徽章展示组件。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import { useDisplayDataSource } from '../useDisplayDataSource'
import type { RBadgeProps } from './DisplayBadge.props'

const props = withDefaults(defineProps<RBadgeProps>(), {
  type: 'r-badge',
  max: 99,
  isDot: false,
  hiddenBadge: false,
  badgeType: 'danger',
  showZero: true,
})

const { isVisible } = useSparkPageComponent(props)

const { resolvedValue: dataValue } = useDisplayDataSource(props)

const resolvedBadgeValue = computed(() => {
  if (props.badgeValue !== undefined) return props.badgeValue
  const v = dataValue.value
  if (typeof v === 'number' || typeof v === 'string') return v
  return undefined
})

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>


