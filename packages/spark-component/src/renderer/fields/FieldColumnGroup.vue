<!--
/**
 * @skill r-column-group
 * @description 表格分组列（多行表头），纯分组容器，不绑定数据字段，子组件为实际数据列
 * @example
 * {
 *   "type": "r-column-group",
 *   "props": { "label": "地址信息" },
 *   "children": [
 *     { "type": "r-text", "name": "province", "props": { "label": "省份" } },
 *     { "type": "r-text", "name": "city", "props": { "label": "城市" } },
 *     { "type": "r-text", "name": "zip", "props": { "label": "邮编" } }
 *   ]
 * }
 */
-->
<template>
  <el-table-column
    :label="label"
    :width="width"
    :min-width="minWidth"
    :fixed="fixed"
    :align="align"
    :header-align="headerAlign"
    :class-name="className"
    :label-class-name="labelClassName"
  >
    <SparkComponentRenderer
      v-for="(child, i) in mergedChildren"
      :key="child.id ?? `col-group-${i}`"
      :config="child"
    />
  </el-table-column>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer } from '../_pkg'
import type { SparkNode } from '../_pkg'

interface Props {
  config?: SparkNode
  label?: string
  width?: string | number
  minWidth?: string | number
  fixed?: boolean | 'left' | 'right'
  align?: 'left' | 'center' | 'right'
  headerAlign?: 'left' | 'center' | 'right'
  className?: string
  labelClassName?: string
  sparkChildren?: SparkNode[]
}

const props = defineProps<Props>()

const label = computed(() => props.label ?? props.config?.props?.['label'] as string ?? '')
const mergedChildren = computed<SparkNode[]>(() =>
  props.config?.children ?? props.sparkChildren ?? []
)
</script>
