/**
 * data-components/view-state.ts
 *
 * 汇总 RendererList / RendererTable / RendererTree / RendererForm / RendererDetail 五类容器的视图态层，
 * 共享工具类型与纯函数，消除各容器 view-state.ts 中的重复代码。
 */

import { computed } from 'vue'
import { SparkData, type DataView, type IDataRow, type TreeConfig } from '@spark-view/spark-data'
import type { ValueRef } from '../../shared-types.js'
import { useDataViewState } from './useDataViewState'
import type { TreeNode } from './RendererTree/zero-code'

// ============================================================
// § 共享类型
// ============================================================

/**
 * SparkData.createTreeManager 消费的种子节点形状。
 * Table 与 Tree 视图态共用同一类型，此处定义唯一来源。
 */
interface TreeManagerSeedNode extends Record<string, unknown> {
  id: string | number
  name: string
  parentId?: string | number | null
}

// ============================================================
// § 共享工具函数
// ============================================================

/**
 * 将原始 parentId 值统一解析为 `string | number | null`。
 * Table 与 Tree 的树形构建逻辑共用此函数。
 */
function resolveParentId(rawParentId: unknown): string | number | null {
  if (typeof rawParentId === 'string' || typeof rawParentId === 'number') return rawParentId
  if (rawParentId === null || rawParentId === undefined) return null
  return String(rawParentId)
}

/**
 * 判断行数据是否已经是嵌套（children 数组）结构，避免重复转换。
 */
function isAlreadyNested(rows: Array<Record<string, unknown>>): boolean {
  return rows.some(row => Array.isArray(row['children']))
}

// ============================================================
// § RendererList 视图态
// ============================================================

interface RendererListViewStateOptions {
  resolvedView: ValueRef<DataView | null | undefined>
}

/**
 * RendererList 与 DataView 的唯一对接层。
 *
 * 组件模板不直接访问 DataView 属性，全部通过此函数返回的 computeds 消费。
 */
export function useRendererListViewState(options: RendererListViewStateOptions) {
  const { rows } = useDataViewState(options.resolvedView)

  return {
    listRows: rows,
  }
}

// ============================================================
// § RendererTable 视图态
// ============================================================

interface RendererTableViewStateOptions {
  baseElTableProps: ValueRef<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null | undefined>
}

const DEFAULT_TABLE_TREE_PROPS: Readonly<Record<string, unknown>> = Object.freeze({
  children: 'children',
  hasChildren: 'hasChildren',
})

export function useRendererTableViewState(options: RendererTableViewStateOptions) {
  const {
    rows,
    currentRow,
    selectedRows,
    primaryKey,
    isMultiSelect,
    treeConfig,
  } = useDataViewState(options.resolvedView)

  // 表格数据：普通列表直接透传；树形配置下按需构造成嵌套 children
  const tableData = computed(() => buildTreeTableRows(rows.value, treeConfig.value, primaryKey.value))

  // rowKey 优先主键，缺失时回退到 tree id 字段
  const tableRowKeyValue = computed(() =>
    primaryKey.value
    ?? treeConfig.value?.idField
  )

  // 仅树表时挂载 treeProps，避免普通表引入多余配置
  const tableTreePropsValue = computed<Record<string, unknown> | undefined>(() => {
    if (!treeConfig.value) return undefined
    return DEFAULT_TABLE_TREE_PROPS
  })

  // 组装传给 el-table 的最终 props，仅在未显式配置时注入默认值
  const elTableProps = computed<Record<string, unknown>>(() => {
    const result = { ...options.baseElTableProps.value }

    if (!treeConfig.value) return result

    if (result['rowKey'] === undefined && tableRowKeyValue.value) {
      result['rowKey'] = tableRowKeyValue.value
    }

    if (result['treeProps'] === undefined && tableTreePropsValue.value) {
      result['treeProps'] = tableTreePropsValue.value
    }

    return result
  })

  return {
    tableData,
    elTableProps,
    currentRow,
    selectedRows,
    primaryKey,
    isMultiSelect,
  }
}

// ============================================================
// § RendererTable — 树形数据构建
// ============================================================

/**
 * 将平铺行数据按 treeConfig 构建成 el-table 可消费的嵌套 children 结构。
 * 无树配置或数据已是嵌套时原样返回。
 */
function buildTreeTableRows(
  rows: IDataRow[],
  treeConfig: TreeConfig | undefined,
  primaryKey: string | undefined,
): IDataRow[] {
  if (rows.length === 0) return rows
  if (isAlreadyNested(rows as Array<Record<string, unknown>>)) return rows
  if (!treeConfig) return rows

  const idFieldRaw = treeConfig.idField ?? primaryKey
  if (typeof idFieldRaw !== 'string' || idFieldRaw.length === 0) return rows
  const idField = idFieldRaw
  const parentIdField = treeConfig.parentIdField ?? 'parentId'
  const textField = treeConfig.textField ?? 'label'

  const seedNodes: TreeManagerSeedNode[] = []
  let hasParentLink = false

  for (const row of rows) {
    const record = row as Record<string, unknown>

    const rawId = record[idField]
    if (typeof rawId !== 'string' && typeof rawId !== 'number') continue

    const parentId = resolveParentId(record[parentIdField])
    if (parentId !== null) hasParentLink = true

    seedNodes.push({
      ...record,
      id: rawId,
      parentId,
      name: typeof record[textField] === 'string'
        ? record[textField]
        : String(record[textField] ?? rawId),
    })
  }

  // 没有有效节点或不存在父子关系时保持平铺
  if (seedNodes.length === 0 || !hasParentLink) return rows

  // 通过 SparkData 统一构建 nested tree，保持与 DataSet 体系一致
  return SparkData.createTreeManager({
    idField,
    parentIdField,
    textField,
    treeMode: 'nested',
  }, seedNodes).buildNestedTree() as IDataRow[]
}

// ============================================================
// § RendererTree 视图态
// ============================================================

interface RendererTreeViewStateOptions {
  resolvedView: ValueRef<DataView | null | undefined>
  treeIdField: ValueRef<string>
}

export function useRendererTreeViewState(options: RendererTreeViewStateOptions) {
  const {
    rows,
    currentRow,
    primaryKey,
    treeConfig,
  } = useDataViewState(options.resolvedView)

  const labelField = computed(() =>
    treeConfig.value?.textField ?? 'label'
  )

  function getNodeLabel(data: unknown): string {
    const node = data as Record<string, unknown> | undefined
    if (!node) return '节点'
    const value = node[labelField.value]
    if (typeof value === 'string') return value
    return (node['label'] as string | undefined)
      ?? (node['name'] as string | undefined)
      ?? (node['title'] as string | undefined)
      ?? '节点'
  }

  const treeData = computed<TreeNode[]>(() => {
    const resolvedRows = rows.value as TreeNode[]
    if (resolvedRows.length === 0) return []
    if (isAlreadyNested(resolvedRows as Array<Record<string, unknown>>)) return resolvedRows
    if (!treeConfig.value) return resolvedRows

    const parentIdField = treeConfig.value.parentIdField ?? 'parentId'
    const seedNodes: TreeManagerSeedNode[] = resolvedRows.flatMap(row => {
      const rawId = row[options.treeIdField.value]
      if (typeof rawId !== 'string' && typeof rawId !== 'number') return []

      return [{
        ...row,
        id: rawId,
        parentId: resolveParentId(row[parentIdField]),
        name: getNodeLabel(row),
      }]
    })

    return SparkData.createTreeManager({
      idField: options.treeIdField.value,
      parentIdField,
      textField: treeConfig.value.textField ?? 'label',
      treeMode: 'nested',
    }, seedNodes).buildNestedTree() as TreeNode[]
  })

  const elTreeFieldProps = computed(() => ({
    children: 'children',
    label: labelField.value,
  }))

  return {
    treeData,
    elTreeFieldProps,
    getNodeLabel,
    currentRow,
    primaryKey,
    treeConfig,
  }
}

// ============================================================
// § RendererForm / RendererDetail 视图态
// ============================================================

interface RendererFormDetailViewStateOptions {
  resolvedView: ValueRef<DataView | null | undefined>
}

/**
 * RendererForm / RendererDetail 与 DataView 的对接层。
 *
 * 表单/详情仅需 currentRow 投影（contextData 镜像驱动），
 * 通过本层统一接入，保持与 List / Table / Tree 的 view-state 模式一致。
 */
export function useRendererFormDetailViewState(options: RendererFormDetailViewStateOptions) {
  const { currentRow } = useDataViewState(options.resolvedView)
  return { currentRow }
}
