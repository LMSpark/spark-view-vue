<template>
  <el-table
    :data="tableData"
    :border="config.border"
    :stripe="config.stripe"
    class="table-renderer"
  >
    <!-- 默认插槽：表格列内容 -->
    <slot />
    
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
    
    return {
      tableData
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
