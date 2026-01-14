<template>
  <el-table
    :data="tableData"
    :border="config.border"
    :stripe="config.stripe"
    :highlight-current-row="config.highlightCurrentRow"
    :row-key="config.rowKey"
    :max-height="config.maxHeight"
    :size="config.size"
    class="table-renderer"
    v-bind="tableAttrs"
  >
    <!-- 默认插槽：表格列内容（递归渲染子节点） -->
    <slot :data="tableData" />
    
    <!-- 具名插槽：自定义表格内容 -->
    <template #append>
      <slot name="append" />
    </template>
    
    <!-- 具名插槽：空数据显示 -->
    <template #empty>
      <slot name="empty">
        <div class="empty-data">暂无数据</div>
      </slot>
    </template>
    
    <!-- 具名插槽：展开行内容 -->
    <template #expand="scope">
      <slot name="expand" :row="scope.row" :index="scope.$index" />
    </template>
  </el-table>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue'
import { ElTable } from 'element-plus'

export default defineComponent({
  name: 'TableRenderer',
  components: {
    ElTable
  },
  props: {
    config: {
      type: Object,
      required: true
    },
    parentType: String,
    data: Object
  },
  setup(props) {
    const tableData = computed(() => {
      if (!props.config.dataSource || !props.data) return []
      const keys = props.config.dataSource.split('.')
      let result = props.data
      for (const key of keys) {
        result = result?.[key]
        if (!result) return []
      }
      return Array.isArray(result) ? result : []
    })
    
    // 提取其他表格属性
    const tableAttrs = computed(() => {
      // Intentionally unused extracted props (prefixed with _)
      const { dataSource: _dataSource, border: _border, stripe: _stripe, highlightCurrentRow: _highlightCurrentRow, rowKey: _rowKey, maxHeight: _maxHeight, size: _size, children: _children, ...attrs } = props.config
      return attrs
    })
    
    return {
      tableData,
      tableAttrs
    }
  }
})
</script>

<style scoped>
.table-renderer {
  width: 100%;
}

.empty-data {
  color: #909399;
  font-size: 14px;
  text-align: center;
  padding: 40px 0;
}
</style>
