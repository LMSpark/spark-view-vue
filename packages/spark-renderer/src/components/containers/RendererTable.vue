<template>
  <el-table :data="tableData" v-bind="$attrs">
    <slot />
  </el-table>
</template>

<script setup lang="ts">
/**
 * RendererTable - 表格容器组件
 * 
 * 通过 provide 告知子字段组件当前处于 table 上下文，
 * 同时提供表格数据供子组件访问。
 */
import { provide, computed } from 'vue'

interface Props {
  dataSource?: import('@spark-view/spark-data').IDataSource | import('@spark-view/spark-data').DataView | undefined
  dataView?: import('@spark-view/spark-data').DataView | undefined
}

const props = defineProps<Props>()

// 只支持 props.dataSource / props.dataView（不再支持 props.data）
const resolvedDataSource = computed(() => (props.dataSource ?? props.dataView) as import('@spark-view/spark-data').IDataSource | undefined)

const tableData = computed(() => {
  const ds = resolvedDataSource.value as import('@spark-view/spark-data').IDataSource | undefined
  if (ds && Array.isArray(ds.rows)) return ds.rows
  return []
})

// 若 dataSource 为 DataView 并且当前无数据，组件挂载后调用其 loadFromServer()
import { onMounted, watch } from 'vue'

function tryAutoLoad(ds: import('@spark-view/spark-data').IDataSource | undefined) {
  if (!ds) return
  // 仅在 rows 为空且 loadFromServer 可用时触发
  const maybeDV = ds as import('@spark-view/spark-data').DataView | undefined
  if (Array.isArray(ds.rows) && ds.rows.length === 0 && maybeDV && typeof maybeDV.loadFromServer === 'function') {
    // 不等待，视图方法会自己处理 isLoading/错误
    void maybeDV.loadFromServer().catch((e: unknown) => {
      // 记录但不抛出，避免破坏渲染
      console.error('RendererTable: dataSource.loadFromServer() 失败', e)
    })
  }
}

onMounted(() => {
  tryAutoLoad(resolvedDataSource.value)
})

// 当 dataSource 发生变更（prop 替换）时再次尝试加载
watch(resolvedDataSource, (nv) => {
  tryAutoLoad(nv)
})

// 提供上下文给子字段组件（保持向后兼容：contextData 仍为 rows 数组）
provide('fieldContext', 'table')
provide('contextData', tableData)
// 新增提供 dataSource（供需要分页/元信息的自定义子组件使用）
provide('contextDataSource', resolvedDataSource)
</script>
