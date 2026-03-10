<template>
  <!-- table 上下文：el-table-column -->
  <template v-if="context === 'table'">
    <!-- 分组列（多行表头） -->
    <el-table-column v-if="mergedChildren.length > 0" :label="displayLabel" :width="width">
      <SparkComponentRenderer
        v-for="(child, i) in mergedChildren"
        :key="child.id ?? `fcr-child-${i}`"
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

  <!-- form 上下文：el-form-item -->
  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
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
import { SparkComponentRenderer } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import type { IDataRow } from '@spark-view/spark-data'

interface Props {
  context: string
  displayLabel: string
  fieldName: string
  width: number | undefined
  mergedChildren: ComponentConfig[]
  isCurrentFieldHidden: boolean
  currentDisplayValue: string
  isTableCellHidden: (row: IDataRow) => boolean
  getTableCellDisplayValue: (row: IDataRow) => string
}

defineProps<Props>()

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
