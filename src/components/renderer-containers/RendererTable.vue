<template>
  <el-table
    :data="tableData"
    v-bind="$attrs"
    @current-change="handleCurrentChange"
    @selection-change="handleSelectionChange"
  >
    <!-- Config / sparkChildren 驱动 —— 通用递归渲染，父级不知道子级是谁 -->
    <template v-if="mergedChildren.length">
      <SparkComponentRenderer
        v-for="(child, i) in mergedChildren"
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
import type { IDataRow, DataView } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '@spark-view/spark-component'
import { FIELD_CONTEXT } from '../capability-keys'

interface Props {
  /** SPARK 配置驱动（主入口）— dataKey / children 均从此取 */
  config?: ComponentConfig
  /** DataKey 格式：tableName@field（与 config 同层冗余时以 config.props.dataKey 为准） */
  dataKey?: string
  /** bindRules 从 rule.children 提取的子组件配置（form-create 路径） */
  sparkChildren?: ComponentConfig[]
  /** 直接传入的 DataView（备用） */
  dataView?: DataView | undefined
}

const props = defineProps<Props>()

// 配置内容优先从 config.props 取，否则回退到平层 prop
const effectiveDataKey = computed(() =>
  (props.config?.props?.['dataKey'] as string | undefined) ?? props.dataKey
)

// 配置驱动模式下的子组件列表（config.children > sparkChildren > 空）
const mergedChildren = computed(() => props.config?.children ?? props.sparkChildren ?? [])

// 接入 SPARK 能力链
const { consume, provide: sparkProvide, logger } = useSparkComponent(
  props.config ?? { type: 'r-table' }
)
const pageDataSet = consume(PAGE_DATASET)

// ── 统一解析 DataView：所有数据交互的唯一中介 ──
const resolvedView = computed<DataView | null>(() => {
  if (effectiveDataKey.value && pageDataSet) {
    const dk = parseDataKey(effectiveDataKey.value)
    if (dk) return (pageDataSet.getView(dk.tableName, dk.viewId) as DataView) ?? null
  }
  return props.dataView ?? null
})

// 表格行数据：始终从 DataView.rows 读取
const tableData = computed(() => resolvedView.value?.rows ?? [])

function tryAutoLoad(view: DataView | null) {
  if (!view) return
  // 内联数据表（无 API 配置）不需要远程加载
  if (!view.dataTable?.api) return
  if (typeof view.requestData === 'function') {
    void view.requestData().catch((e: unknown) => {
      logger.error('RendererTable: requestData() 失败', e)
    })
  }
}

// 向字段子组件提供渲染上下文
sparkProvide(FIELD_CONTEXT, 'table')

// ── el-table currentChange → DataView.selection.setCurrentRow ──
function handleCurrentChange(currentRow: IDataRow | null) {
  resolvedView.value?.selection.setCurrentRow(currentRow ?? null)
}

// ── el-table selectionChange → DataView.selection.setSelectedRows ──
function handleSelectionChange(selection: IDataRow[]) {
  resolvedView.value?.selection.setSelectedRows(Array.isArray(selection) ? selection : [])
}

// 统一 watcher：DataView → DATA_SOURCE 提供 + 自动加载
watch(resolvedView, (view) => {
  if (!view) return
  sparkProvide(DATA_SOURCE, view)
  tryAutoLoad(view)
}, { immediate: true })

onMounted(() => tryAutoLoad(resolvedView.value))
</script>
