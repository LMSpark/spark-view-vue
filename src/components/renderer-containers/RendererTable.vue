<template>
  <el-table :data="tableData" v-bind="$attrs">
    <!-- Config 驱动 —— 通用递归渲染 config.children，父级不知道子级是谁 -->
    <template v-if="configChildren.length">
      <SparkComponentRenderer
        v-for="(child, i) in configChildren"
        :key="child.id ?? `r-table-child-${i}`"
        :config="child"
      />
    </template>
    <!-- Template 驱动 —— 保留 <slot> 向后兼容 -->
    <slot v-else />
  </el-table>
</template>

<script setup lang="ts">
/**
 * RendererTable - 表格容器组件
 *
 * 双模式：
 *   配置驱动：传入 config，子组件由 SparkComponentRenderer 通用递归渲染
 *   模板驱动：不传 config，通过 <slot> 接收模板子内容
 */
import { computed, onMounted, watch } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import { parseDataKey } from '@spark-view/spark-data'
import type { IDataSource, DataView } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '@spark-view/spark-component'
import { FIELD_CONTEXT, CONTEXT_DATA } from '../capability-keys'

interface Props {
  /** SPARK 配置驱动（主入口）— dataKey / children 均从此取 */
  config?: ComponentConfig
  /** DataKey 格式：scope@tableName@viewId@field（与 config 同层冗余时以 config.props.dataKey 为准） */
  dataKey?: string
  /** 直接传入的数据源（备用） */
  dataSource?: IDataSource | DataView | undefined
  dataView?: DataView | undefined
}

const props = defineProps<Props>()

// 配置内容优先从 config.props 取，否则回退到平层 prop
const effectiveDataKey = computed(() =>
  (props.config?.props?.['dataKey'] as string | undefined) ?? props.dataKey
)

// 配置驱动模式下的子组件列表
const configChildren = computed(() => props.config?.children ?? [])

// 接入 SPARK 能力链：配置驱动时传入完整 config。模板驱动时transmit 最小 context
const { consume, provide: sparkProvide, logger } = useSparkComponent(
  props.config ?? { type: 'r-table' }
)
const pageDataSet = consume(PAGE_DATASET)

// 解析数据视图：dataKey 优先 → PAGE_DATASET；回退到直接 props
const resolvedDataSource = computed(() => {
  if (effectiveDataKey.value && pageDataSet) {
    const dk = parseDataKey(effectiveDataKey.value)
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

function tryAutoLoad(ds: IDataSource | undefined) {
  if (!ds) return
  const maybeDV = ds as DataView | undefined
  if (maybeDV && typeof maybeDV.requestData === 'function') {
    void maybeDV.requestData().catch((e: unknown) => {
      logger.error('RendererTable: requestData() 失败', e)
    })
  }
}

// 向字段子组件提供渲染上下文
sparkProvide(FIELD_CONTEXT, 'table')
sparkProvide(CONTEXT_DATA, {} as Record<string, unknown>)

// 统一 watcher：DATA_SOURCE 提供 + 自动加载
watch(resolvedDataSource, (nv) => {
  if (!nv) return
  sparkProvide(DATA_SOURCE, nv)
  tryAutoLoad(nv)
}, { immediate: true })

onMounted(() => tryAutoLoad(resolvedDataSource.value))
</script>
