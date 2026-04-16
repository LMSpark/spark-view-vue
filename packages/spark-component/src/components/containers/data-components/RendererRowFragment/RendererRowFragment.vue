<template>
  <!--
    table 宿主：将行片段渲染为 el-table-column。
    列标题、宽度、对齐均由 props 传入；
    行数据通过 el-table 的 slot scope 取得，再交给 RendererHostScope 向下传播。
  -->
  <el-table-column
    v-if="isTableHost"
    :label="resolvedColumnLabel"
    :width="width"
    :min-width="minWidth"
    :align="align"
    :header-align="resolvedHeaderAlign"
    :class-name="props.class"
  >
    <template #default="scope">
      <RendererHostScope
        type="r-data-scope"
        :row="resolveSlotRow(scope)"
        :children="resolvedChildren"
      />
    </template>
  </el-table-column>

  <!--
    非 table 宿主（form / detail / tree 等）：直接渲染为数据作用域包装层。
    行数据来自 props.data，若未提供则退化为空对象，保证子字段不会读到 undefined。
  -->
  <RendererHostScope
    v-else
    type="r-data-scope"
    :row="resolvedData"
    :children="resolvedChildren"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import { getSparkNodeChildren, type SparkNode } from '../../../internal'
import { useResolvedFieldContext } from '../../../fields/context/useResolvedFieldContext'
import RendererHostScope from '../../support/RendererHostScope.vue'
import type { RendererRowFragmentProps as Props } from './RendererRowFragment.types.js'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-row-fragment',
})

// ===== 宿主模式判断 =====

// 从最近 host 上下文读取字段渲染模式，据此决定当前片段走 table 列路径还是通用路径。
const resolvedHostMode = useResolvedFieldContext()
const isTableHost = computed(() => resolvedHostMode.value === 'table')

// ===== 子节点与列属性解析 =====

// fields 优先级高于 children：fields 作为显式"字段列表"语义；children 作为兜底通用子节点。
const resolvedChildren = computed<SparkNode[]>(() => {
  const fieldNodes = getSparkNodeChildren(props.fields)
  if (fieldNodes.length > 0) return fieldNodes
  return getSparkNodeChildren(props.children)
})

// table 宿主下的列标题：title 优先，label 次之，均缺省时退化为空字符串。
const resolvedColumnLabel = computed(() => props.title ?? props.label ?? '')

// 表头对齐默认跟随内容对齐，只在 headerAlign 显式配置时才独立使用。
const resolvedHeaderAlign = computed(() => props.headerAlign ?? props.align)

// ===== 非 table 宿主行数据 =====

// 冻结空对象作为"无数据"语义，避免子字段因 undefined 而崩溃，同时防止意外写入。
const EMPTY_DATA_ROW = Object.freeze({}) as IDataRow

// 非 table 宿主下的行数据来源，props.data 缺省时退化为空行。
const resolvedData = computed(() => props.data ?? EMPTY_DATA_ROW)

// ===== 工具函数 =====

// 从 el-table slot scope 中安全提取行对象，非普通对象（null / 数组等）一律退化为空行。
function resolveSlotRow(scope: Record<string, unknown>): IDataRow {
  const row = scope['row']
  return row !== null && row !== undefined && typeof row === 'object' && !Array.isArray(row)
    ? row as IDataRow
    : EMPTY_DATA_ROW
}
</script>