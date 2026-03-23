<template>
  <!-- table 上下文：el-table-column -->
  <template v-if="context === 'table'">
    <!-- 分组列（多行表头） -->
    <el-table-column v-if="mergedChildren.length > 0" :label="displayLabel" :width="width">
      <SparkComponentRenderer
        v-for="(child, i) in mergedChildren"
        :key="nodeId(child) ?? `fcr-child-${i}`"
        :config="child"
      />
    </el-table-column>
    <!-- 数据列 -->
    <el-table-column v-else :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <template v-if="!isTableCellHidden(row)">
          <slot name="table-cell" :row="row" :value="getTableCellDisplayValue(row)">
            <span>{{ getTableCellDisplayValue(row) }}</span>
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
          <span class="field-label">{{ displayLabel }}：</span>
          <span class="field-value">{{ currentDisplayValue }}</span>
        </div>
      </slot>
    </template>
  </template>
</template>

<script setup lang="ts">
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
}

const _props = defineProps<Props>()

defineSlots<{
  'table-cell'(props: { row: IDataRow; value: string }): unknown
  'form'(): unknown
  'tree'(): unknown
  'detail'(): unknown
}>()
</script>

<style scoped>
.field-display {
  margin-bottom: 12px;
  line-height: 32px;
}
.field-label {
  color: #606266;
  font-weight: 500;
  margin-right: 8px;
}
.field-value {
  color: #303133;
}
</style>
