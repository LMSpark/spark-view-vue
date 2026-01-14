<template>
  <vxe-table
    class="vxe-table-renderer"
    v-bind="tableAttrs"
    :data="tableData"
  >
    <!-- 默认插槽：表格列内容 -->
    <slot :data="tableData" />
    
    <!-- 空数据插槽 -->
    <template #empty>
      <slot name="empty">
        <div class="empty-data">暂无数据</div>
      </slot>
    </template>
  </vxe-table>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue'

export default defineComponent({
  name: 'VxeTableRenderer',
  props: {
    config: {
      type: Object,
      required: true
    },
    parentType: String,
    data: Object
  },
  setup(props) {
    const dataContext = computed(() => {
      if (props.data) return props.data
      if (typeof window !== 'undefined') {
        return (window as any).__pageContext?.$data || null
      }
      return null
    })

    const tableData = computed(() => {
      // 优先使用 config.data (静态数据)
      if (Array.isArray(props.config.data)) return props.config.data
      
      // 解析 dataSource (绑定数据)
      const source = dataContext.value
      if (!props.config.dataSource || !source) return []
      
      // 处理 dataSource 路径 (e.g., 'dataset.tables.Users.rows')
      const keys = props.config.dataSource.split('.')
      let result = source
      for (const key of keys) {
        // 安全访问
        result = result?.[key]
        if (result === undefined || result === null) return []
      }
      return Array.isArray(result) ? result : []
    })
    
    const tableAttrs = computed(() => {
      // 过滤掉自定义属性，保留 vxe-table 配置属性
      // config.data 和 config.dataSource 已被处理，这里排除
      const { dataSource: _dataSource, data: _data, ...attrs } = props.config
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
.vxe-table-renderer {
  width: 100%;
}
.empty-data {
  padding: 40px 0;
  text-align: center;
  color: #909399;
  font-size: 14px;
}
</style>
