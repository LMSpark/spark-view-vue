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
  /** 分组标题（必填） */
  label?: string
  /** 子节点列表 */
  children?: SparkNode[]
  /** 列宽 */
  width?: string | number
  /** 最小宽度 */
  minWidth?: string | number
  /** 固定方向 */
  fixed?: boolean | 'left' | 'right'
  /** 对齐方式 */
  align?: 'left' | 'center' | 'right'
  /** 表头对齐 */
  headerAlign?: 'left' | 'center' | 'right'
  /** 列自定义样式类 */
  className?: string
  /** 表头自定义样式类 */
  labelClassName?: string
}

const props = defineProps<Props>()

const label = computed(() => props.label ?? '')
const mergedChildren = computed<SparkNode[]>(() => {
  const children = props.children
  if (Array.isArray(children) && children.length > 0) return children
  return []
})
</script>
