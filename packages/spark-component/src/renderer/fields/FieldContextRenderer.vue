<template>
  <!-- table 上下文：el-table-column -->
  <template v-if="context === 'table'">
    <!-- 分组列（多行表头） -->
    <el-table-column
      v-if="mergedChildren.length > 0"
      :label="displayLabel"
      :width="width"
      :header-align="resolvedTitleAlign"
      :label-class-name="tableHeaderClassName"
    >
      <SparkComponentRenderer
        v-for="(child, i) in mergedChildren"
        :key="nodeId(child) ?? `fcr-child-${i}`"
        :config="child"
      />
    </el-table-column>
    <!-- 数据列 -->
    <el-table-column
      v-else
      :label="displayLabel"
      :prop="fieldName"
      :width="width"
      :header-align="resolvedTitleAlign"
      :align="resolvedValueAlign"
      :label-class-name="tableHeaderClassName"
      :class-name="tableCellClassName"
    >
      <template #default="{ row }">
        <template v-if="!isTableCellHidden(row)">
          <slot name="table-cell" :row="row" :value="getTableCellDisplayValue(row)">
            <span :class="['field-table-value', tableValueClassName]">{{ getTableCellDisplayValue(row) }}</span>
          </slot>
        </template>
      </template>
    </el-table-column>
  </template>

  <!-- form 上下文：el-form-item（携带列级验证规则） -->
  <el-form-item
    v-else-if="context === 'form' && !isCurrentFieldHidden"
    :label="displayLabel"
    :prop="fieldName"
    :rules="validationRules"
  >
    <slot name="form" />
  </el-form-item>

  <!-- tree 上下文：树节点文本 -->
  <template v-else-if="context === 'tree'">
    <template v-if="!isCurrentFieldHidden">
      <slot name="tree">
        <span class="tree-node-text">{{ currentDisplayValue }}</span>
      </slot>
    </template>
  </template>

  <!-- detail / 其他上下文：只读展示 -->
  <template v-else>
    <template v-if="!isCurrentFieldHidden">
      <slot name="detail">
        <div class="field-display">
          <span :class="['field-label', detailTitleClassName]">{{ displayLabel }}：</span>
          <span :class="['field-value', detailValueClassName]">{{ currentDisplayValue }}</span>
        </div>
      </slot>
    </template>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer } from '../_pkg'
import { nodeId, type SparkNode } from '../_pkg'
import type { IDataRow } from '@spark-view/spark-data'
import type { FormItemRule } from './columnFormRules'

interface Props {
  /** 渲染上下文（table / form / detail / tree） */
  context: string
  /** 显示标签 */
  displayLabel: string
  /** 字段绑定名 */
  fieldName: string
  /** 列宽 */
  width: number | undefined
  /** 合并后的子组件配置 */
  mergedChildren: SparkNode[]
  /** 当前字段是否隐藏 */
  isCurrentFieldHidden: boolean
  /** 当前显示值 */
  currentDisplayValue: string
  /** 表格行级隐藏判断 */
  isTableCellHidden: (row: IDataRow) => boolean
  /** 表格行级显示值获取 */
  getTableCellDisplayValue: (row: IDataRow) => string
  /** 表单验证规则 */
  validationRules: FormItemRule[]
  /** 标题对齐（table/detail） */
  titleAlign?: 'left' | 'center' | 'right'
  /** 值对齐（table/detail） */
  valueAlign?: 'left' | 'center' | 'right'
  /** 表头 class（table） */
  headerCellClassName?: string
  /** 单元格 class（table） */
  cellClassName?: string
  /** 标题 class（detail） */
  titleClassName?: string
  /** 值 class（detail/table value） */
  valueClassName?: string
}

const props = defineProps<Props>()

const resolvedTitleAlign = computed(() => props.titleAlign ?? 'left')
const resolvedValueAlign = computed(() => props.valueAlign ?? 'left')

const tableHeaderClassName = computed(() => (
  props.headerCellClassName ?? `spark-col-header--${resolvedTitleAlign.value}`
))

const tableCellClassName = computed(() => (
  props.cellClassName ?? `spark-col-cell--${resolvedValueAlign.value}`
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
