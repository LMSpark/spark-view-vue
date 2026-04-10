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
    v-bind="$attrs"
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
 * @skill-description 徽章展示组件，基于 el-badge 在子内容上叠加数字或状态点标记。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'
import { useDisplayDataSource } from '../useDisplayDataSource'
import type { SparkRuntimeChildrenProps } from '../../shared-types.js'

interface Props extends SparkRuntimeChildrenProps<'r-badge'> {
  children?: SparkNode[]
  badgeValue?: string | number
  value?: string | number
  field?: string
  max?: number
  isDot?: boolean
  hiddenBadge?: boolean
  badgeType?: '' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
  showZero?: boolean
  color?: string
  offset?: [number, number]
  badgeStyle?: object
  badgeClass?: string
}

const props = withDefaults(defineProps<Props>(), {
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
