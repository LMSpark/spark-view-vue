<template>
  <el-table :data="tableData" v-bind="$attrs">
    <slot />
  </el-table>
</template>

<script setup lang="ts">
/**
 * RendererTable - 表格容器组件
 *
 * 内部通过 useSparkComponent + consume(PAGE_DATASET) 自行解析 dataKey，
 * 不再依赖 bindRules.ts 外部注入。
 * 解析结果通过 provide(DATA_SOURCE) 供子行/子单元格组件消费。
 */
import { computed, provide, onMounted, watch } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { PAGE_DATASET, DATA_SOURCE, parseDataKey } from '@spark-view/spark-data'
import type { IDataSource, DataView } from '@spark-view/spark-data'

interface Props {
  /** DataKey 格式：scope@tableName@viewId@field （优先） */
  dataKey?: string
  /** 直接传入的数据源（备用，dataKey 不存在时生效） */
  dataSource?: IDataSource | DataView | undefined
  dataView?: DataView | undefined
}

const props = defineProps<Props>()

// 接入 SPARK 能力链，消费页面层 provide 的 DataSet
const { consume, provide: sparkProvide } = useSparkComponent({ type: 'r-table' })
const pageDataSet = consume(PAGE_DATASET)

// 解析数据视图：dataKey 优先 → PAGE_DATASET；回退到直接 props
const resolvedDataSource = computed(() => {
  if (props.dataKey && pageDataSet) {
    const dk = parseDataKey(props.dataKey)
    if (dk) {
      const view = pageDataSet.getView(dk.tableName, dk.viewId)
      if (view) return view as IDataSource
    }
  }
  return (props.dataSource ?? props.dataView) as IDataSource | undefined
})

const tableData = computed(() => {
  const ds = resolvedDataSource.value
  if (ds && Array.isArray(ds.rows)) return ds.rows
  return []
})

// 将 DataView 向下 provide，供子行/单元格组件 consume(DATA_SOURCE)
watch(resolvedDataSource, (nv) => {
  if (nv) sparkProvide(DATA_SOURCE, nv)
}, { immediate: true })

// 若 DataView 无数据，尝试自动加载
function tryAutoLoad(ds: IDataSource | undefined) {
  if (!ds) return
  const maybeDV = ds as DataView | undefined
  if (maybeDV && typeof maybeDV.requestData === 'function') {
    void maybeDV.requestData().catch((e: unknown) => {
      console.error('RendererTable: requestData() 失败', e)
    })
  }
}

onMounted(() => tryAutoLoad(resolvedDataSource.value))
watch(resolvedDataSource, (nv) => tryAutoLoad(nv))

// 向子字段组件提供上下文（向后兼容）
provide('fieldContext', 'table')
provide('contextData', tableData)
provide('contextDataSource', resolvedDataSource)
</script>
