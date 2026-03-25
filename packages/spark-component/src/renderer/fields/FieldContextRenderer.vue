<template>
  <!-- table 上下文：el-table-column -->
  <template v-if="resolvedContext === 'table'">
    <!-- 分组列（多行表头） -->
    <el-table-column
      v-if="resolvedChildren.length > 0"
      :label="resolvedDisplayLabel"
      :width="width"
      :min-width="minWidth"
      :fixed="fixed"
      :align="resolvedValueAlign"
      :header-align="resolvedHeaderAlign"
      :label-class-name="tableHeaderClassName"
      :class-name="tableCellClassName"
    >
      <SparkComponentRenderer
        v-for="(child, i) in resolvedChildren"
        :key="nodeId(child) ?? `fcr-child-${i}`"
        :config="child"
      />
    </el-table-column>
    <!-- 数据列 -->
    <el-table-column
      v-else
      :label="resolvedDisplayLabel"
      :prop="resolvedFieldName"
      :width="width"
      :min-width="minWidth"
      :fixed="fixed"
      :header-align="resolvedHeaderAlign"
      :align="resolvedValueAlign"
      :label-class-name="tableHeaderClassName"
      :class-name="tableCellClassName"
    >
      <template #default="{ row }">
        <template v-if="!resolveTableCellHidden(row)">
          <slot name="table-cell" :row="row" :value="resolveTableCellDisplayValue(row)">
            <span :class="['field-table-value', tableValueClassName]">{{ resolveTableCellDisplayValue(row) }}</span>
          </slot>
        </template>
      </template>
    </el-table-column>
  </template>

  <!-- form 上下文：el-form-item（携带列级验证规则） -->
  <el-form-item
    v-else-if="resolvedContext === 'form' && !resolvedCurrentFieldHidden"
    :label="resolvedDisplayLabel"
    :prop="resolvedFieldName"
    :rules="resolvedValidationRules"
  >
    <slot name="form" />
  </el-form-item>

  <!-- tree 上下文：树节点文本 -->
  <template v-else-if="resolvedContext === 'tree'">
    <template v-if="!resolvedCurrentFieldHidden">
      <slot name="tree">
        <span class="tree-node-text">{{ resolvedCurrentDisplayValue }}</span>
      </slot>
    </template>
  </template>

  <!-- detail / 其他上下文：只读展示 -->
  <template v-else>
    <template v-if="!resolvedCurrentFieldHidden">
      <slot name="detail">
        <div class="field-display">
          <span :class="['field-label', detailTitleClassName]">{{ resolvedDisplayLabel }}：</span>
          <span :class="['field-value', detailValueClassName]">{{ resolvedCurrentDisplayValue }}</span>
        </div>
      </slot>
    </template>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer } from '../_pkg'
import { getSparkNodeChildren, nodeId, type SparkNode } from '../_pkg'
import type { IDataRow } from '@spark-view/spark-data'
import type { FormItemRule } from './columnFormRules'
import { useResolvedFieldContext } from './useResolvedFieldContext'

type TextAlign = 'left' | 'center' | 'right'

interface Props {
  /** 显示标签 */
  displayLabel?: string | undefined
  /** 直接传入的标签（供 r-column-group 直连使用） */
  label?: string | undefined
  /** 字段绑定名 */
  fieldName?: string | undefined
  /** 直接传入的字段名（供裸列节点使用） */
  field?: string | undefined
  /** 列宽 */
  width?: string | number | undefined
  /** 最小列宽 */
  minWidth?: string | number | undefined
  /** 固定列方向 */
  fixed?: boolean | 'left' | 'right' | undefined
  /** 列对齐 */
  align?: TextAlign | undefined
  /** 表头对齐 */
  headerAlign?: TextAlign | undefined
  /** 合并后的子组件配置 */
  mergedChildren?: SparkNode[] | undefined
  /** 直接传入的子节点（供 r-column-group 直连使用） */
  children?: SparkNode[] | undefined
  /** 当前字段是否隐藏 */
  isCurrentFieldHidden?: boolean | undefined
  /** 当前显示值 */
  currentDisplayValue?: string | undefined
  /** 表格行级隐藏判断 */
  isTableCellHidden?: ((row: IDataRow) => boolean) | undefined
  /** 表格行级显示值获取 */
  getTableCellDisplayValue?: ((row: IDataRow) => string) | undefined
  /** 表单验证规则 */
  validationRules?: FormItemRule[] | undefined
  /** 标题对齐（table/detail） */
  titleAlign?: TextAlign | undefined
  /** 值对齐（table/detail） */
  valueAlign?: TextAlign | undefined
  /** 表头 class（table） */
  headerCellClassName?: string | undefined
  /** 兼容直接传入的列头 class */
  labelClassName?: string | undefined
  /** 单元格 class（table） */
  cellClassName?: string | undefined
  /** 兼容直接传入的列 class */
  className?: string | undefined
  /** 标题 class（detail） */
  titleClassName?: string | undefined
  /** 值 class（detail/table value） */
  valueClassName?: string | undefined
}

const props = defineProps<Props>()

const resolvedContext = useResolvedFieldContext()
const resolvedDisplayLabel = computed(() => props.displayLabel ?? props.label ?? '')
const resolvedFieldName = computed(() => props.fieldName ?? props.field ?? '')
const resolvedChildren = computed<SparkNode[]>(() => {
  const children = props.mergedChildren ?? props.children
  return getSparkNodeChildren(children)
})
const resolvedCurrentFieldHidden = computed(() => props.isCurrentFieldHidden ?? false)
const resolvedCurrentDisplayValue = computed(() => props.currentDisplayValue ?? '')
const resolvedValidationRules = computed<FormItemRule[]>(() => props.validationRules ?? [])

const resolvedTitleAlign = computed(() => props.titleAlign ?? 'left')
const resolvedHeaderAlign = computed(() => props.headerAlign ?? resolvedTitleAlign.value)
const resolvedValueAlign = computed(() => props.align ?? props.valueAlign ?? 'left')

const tableHeaderClassName = computed(() => (
  props.headerCellClassName ?? props.labelClassName ?? `spark-col-header--${resolvedHeaderAlign.value}`
))

const tableCellClassName = computed(() => (
  props.cellClassName ?? props.className ?? `spark-col-cell--${resolvedValueAlign.value}`
))

const tableValueClassName = computed(() => (
  props.valueClassName ?? `field-table-value--${resolvedValueAlign.value}`
))

const detailTitleClassName = computed(() => (
  props.titleClassName
    ? props.titleClassName
    :
  props.titleAlign
    ? `field-align--${props.titleAlign}`
    : 'field-align--var-title'
))

const detailValueClassName = computed(() => (
  props.valueClassName
    ? props.valueClassName
    :
  props.valueAlign
    ? `field-align--${props.valueAlign}`
    : 'field-align--var-value'
))

function resolveTableCellHidden(row: IDataRow): boolean {
  return props.isTableCellHidden?.(row) ?? false
}

function resolveTableCellDisplayValue(row: IDataRow): string {
  if (props.getTableCellDisplayValue) return props.getTableCellDisplayValue(row)
  const fieldName = resolvedFieldName.value
  if (!fieldName) return ''
  const value = row[fieldName]
  return value == null ? '' : String(value)
}

defineSlots<{
  'table-cell'(props: { row: IDataRow; value: string }): unknown
  'form'(): unknown
  'tree'(): unknown
  'detail'(): unknown
}>()
</script>

<style scoped>
.field-display {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  align-items: center;
  margin-bottom: 12px;
  line-height: 32px;
}
.field-label {
  display: inline-block;
  color: #606266;
  font-weight: 500;
  margin-right: 8px;
}
.field-value {
  display: inline-block;
  color: #303133;
}

.field-align--left {
  text-align: left;
}

.field-align--center {
  text-align: center;
}

.field-align--right {
  text-align: right;
}

.field-align--var-title {
  text-align: var(--spark-detail-title-align, left);
}

.field-align--var-value {
  text-align: var(--spark-detail-value-align, left);
}

.field-table-value {
  display: inline-block;
  width: 100%;
}

.field-table-value--left {
  text-align: left;
}

.field-table-value--center {
  text-align: center;
}

.field-table-value--right {
  text-align: right;
}

:deep(.spark-col-header--left .cell) {
  text-align: left;
}

:deep(.spark-col-header--center .cell) {
  text-align: center;
}

:deep(.spark-col-header--right .cell) {
  text-align: right;
}

:deep(.spark-col-cell--left .cell) {
  text-align: left;
}

:deep(.spark-col-cell--center .cell) {
  text-align: center;
}

:deep(.spark-col-cell--right .cell) {
  text-align: right;
}
</style>
