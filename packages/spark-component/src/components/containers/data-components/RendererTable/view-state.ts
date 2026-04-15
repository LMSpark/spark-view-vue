import { computed, ref, watch } from 'vue'
import { SparkData, type DataView, type IDataRow } from '@spark-view/spark-data'
import type { FilterNode } from '../../RendererFilter.types'
import type { ValueRef } from '../../../shared-types.js'

// ==============================
// 类型定义
// ==============================

interface RendererTableViewStateOptions {
  filterNode: ValueRef<FilterNode | undefined>
  baseElTableProps: ValueRef<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null | undefined>
  filteredRows: ValueRef<IDataRow[] | undefined>
}

interface TableTreeSeedNode extends Record<string, unknown> {
  id: string | number
  name: string
  parentId?: string | number | null
}

// ==============================
// 常量
// ==============================

const DEFAULT_TABLE_TREE_PROPS: Readonly<Record<string, unknown>> = Object.freeze({
  children: 'children',
  hasChildren: 'hasChildren',
})

// ==============================
// 主状态：RendererTable 视图态
// ==============================

export function useRendererTableViewState(options: RendererTableViewStateOptions) {
  // 表格数据：普通列表直接透传；树形配置下按需构造成嵌套 children
  const tableData = computed(() => buildTreeTableRows(
    options.resolvedView.value,
    options.filteredRows.value ?? options.resolvedView.value?.rows ?? [],
  ))

  // rowKey 优先主键，缺失时回退到 tree id 字段
  const tableRowKeyValue = computed(() =>
    options.resolvedView.value?.primaryKey
    ?? options.resolvedView.value?.treeConfig?.idField
  )

  // 仅树表时挂载 treeProps，避免普通表引入多余配置
  const tableTreePropsValue = computed<Record<string, unknown> | undefined>(() => {
    if (!options.resolvedView.value?.treeConfig) return undefined
    return DEFAULT_TABLE_TREE_PROPS
  })

  // 组装传给 el-table 的最终 props，仅在未显式配置时注入默认值
  const elTableProps = computed<Record<string, unknown>>(() => {
    const result = { ...options.baseElTableProps.value }

    if (!options.resolvedView.value?.treeConfig) return result

    if (result['rowKey'] === undefined && tableRowKeyValue.value) {
      result['rowKey'] = tableRowKeyValue.value
    }

    if (result['treeProps'] === undefined && tableTreePropsValue.value) {
      result['treeProps'] = tableTreePropsValue.value
    }

    return result
  })

  // 过滤区展示态
  const filterCollapsibleValue = computed(() => options.filterNode.value?.props?.collapsible ?? false)
  const filterDefaultCollapsedValue = computed(() => options.filterNode.value?.props?.defaultCollapsed ?? false)
  const filterAutoFitMinWidthValue = computed(() => options.filterNode.value?.props?.autoFitMinWidth ?? '220px')
  const filterItemSpanValue = computed(() => options.filterNode.value?.props?.itemSpan ?? 1)

  const filtersCollapsed = ref(filterDefaultCollapsedValue.value)

  watch(filterDefaultCollapsedValue, (value) => {
    filtersCollapsed.value = value
  })

  function toggleFiltersCollapsed() {
    // 未开启可折叠时直接 fail-fast 返回
    if (!filterCollapsibleValue.value) return
    filtersCollapsed.value = !filtersCollapsed.value
  }

  return {
    tableData,
    elTableProps,
    filterCollapsibleValue,
    filterAutoFitMinWidthValue,
    filterItemSpanValue,
    filtersCollapsed,
    toggleFiltersCollapsed,
  }
}

// ==============================
// 树形数据构建
// ==============================

function buildTreeTableRows(view: DataView | null | undefined, rows: IDataRow[]): IDataRow[] {
  // 空数据或无视图时保持原样
  if (!view || rows.length === 0) return rows

  // 已经是嵌套结构则不重复转换
  if (rows.some(row => Array.isArray((row as Record<string, unknown> | undefined)?.['children']))) {
    return rows
  }

  const treeConfig = view.treeConfig
  if (!treeConfig) return rows

  const idField = treeConfig.idField ?? view.primaryKey
  const parentIdField = treeConfig.parentIdField ?? 'parentId'
  const textField = treeConfig.textField ?? 'label'

  const seedNodes: TableTreeSeedNode[] = []
  let hasParentLink = false

  for (const row of rows) {
    const record = row as Record<string, unknown>

    // 节点 id 非法时跳过，避免污染树结构
    const rawId = record[idField]
    if (typeof rawId !== 'string' && typeof rawId !== 'number') {
      continue
    }

    const rawParentId = record[parentIdField]
    const parentId = typeof rawParentId === 'string' || typeof rawParentId === 'number'
      ? rawParentId
      : rawParentId === null || rawParentId === undefined
        ? null
        : String(rawParentId)

    if (parentId !== null) {
      hasParentLink = true
    }

    // 统一成 TreeManager 可消费的种子节点
    seedNodes.push({
      ...record,
      id: rawId,
      parentId,
      name: typeof record[textField] === 'string'
        ? record[textField]
        : String(record[textField] ?? rawId),
    })
  }

  if (seedNodes.length === 0 || !hasParentLink) return rows
  // 没有有效节点或不存在父子关系时保持平铺

  return SparkData.createTreeManager({
  // 通过 SparkData 统一构建 nested tree，保持与 DataSet 体系一致
    idField,
    parentIdField,
    textField,
    treeMode: 'nested',
  }, seedNodes).buildNestedTree() as IDataRow[]
}
