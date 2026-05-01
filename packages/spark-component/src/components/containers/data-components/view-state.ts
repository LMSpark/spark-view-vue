/**
 * data-components/view-state.ts
 *
 * 汇总 RendererList / RendererTable / RendererTree / RendererForm / RendererDetail 五类容器的视图态层，
 * 共享工具类型与纯函数，消除各容器 view-state.ts 中的重复代码。
 */

import { computed, nextTick, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { SparkData, type DataView, type IDataRow, type IModelPermission, type TreeConfig } from '@spark-view/spark-data'
import type { IDataSource } from '@spark-view/spark-data'
import type { ValueRef } from '../../shared-types.js'
import { getSparkNodeChildren, type SparkNode } from '../../internal'
import type { TreeNode } from './RendererTree/zero-code'
import { resolveNodeBeforeRender, mergeNodeBeforeRenderProps } from '../../support/beforeRender'

// ============================================================
// § 共享类型
// ============================================================

/**
 * DataView 投影后的统一视图态（五类容器共享）。
 */
interface DataViewState {
  tableName: ComputedRef<IDataSource['tableName']>
  rows: ComputedRef<NonNullable<IDataSource['rows']>>
  columns: ComputedRef<IDataSource['columns']>
  currentRow: ComputedRef<IDataRow | null>
  selectedRows: ComputedRef<IDataRow[]>
  _modelPerm: ComputedRef<IDataSource['_modelPerm']>
  value: ComputedRef<IDataSource['value']>
  label: ComputedRef<IDataSource['label']>
  labels: ComputedRef<IDataSource['labels']>
  primaryKey: ComputedRef<string | undefined>
  isMultiSelect: ComputedRef<boolean>
  requestState: ComputedRef<IDataSource['requestState']>
  treeConfig: ComputedRef<TreeConfig | undefined>
  aggregateResult: ComputedRef<AggregateResultState>
  selectionAggregateResult: ComputedRef<AggregateResultState>
  total: ComputedRef<number>
  page: ComputedRef<number>
  pageSize: ComputedRef<number>
  mutating: ComputedRef<boolean>
  mutatingError: ComputedRef<Error | null>
  loadingError: ComputedRef<Error | null>
}

type RendererListViewState = DataViewState & {
  listRows: DataViewState['rows']
}

type RendererTableViewState = DataViewState & {
  tableData: ComputedRef<IDataRow[]>
  elTableProps: ComputedRef<Record<string, unknown>>
  selectedRowIdSet: ComputedRef<Set<string | number>>
  selectedRowRefSet: ComputedRef<Set<IDataRow>>
  isSelectedRow: (row: IDataRow) => boolean
}

type RendererTreeViewState = DataViewState & {
  treeData: ComputedRef<TreeNode[]>
  elTreeFieldProps: ComputedRef<{ children: string; label: string }>
  getNodeLabel: (data: unknown) => string
  visibleToolbarConfigs: ComputedRef<SparkNode[]>
  showToolbar: ComputedRef<boolean>
  treeIdField: ComputedRef<string>
  nodeKeyField: ComputedRef<string>
}

type RendererFormDetailViewState = DataViewState

/**
 * SparkData.createTreeManager 消费的种子节点形状。
 * Table 与 Tree 视图态共用同一类型，此处定义唯一来源。
 */
interface TreeManagerSeedNode extends Record<string, unknown> {
  id: string | number
  name: string
  parentId?: string | number | null
}
type AggregateResultState = Readonly<Record<string, unknown>>
type ResolvedViewRef = ValueRef<DataView | null | undefined>

interface BaseViewStateOptions {
  resolvedView: ResolvedViewRef
}

type ViewStateOptions<T extends Record<string, unknown> = Record<never, never>> = BaseViewStateOptions & T

const EMPTY_AGGREGATE_RESULT: AggregateResultState = Object.freeze({})
const EMPTY_SELECTION_AGGREGATE_RESULT: AggregateResultState = Object.freeze({})

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function normalizeAggregateResult(value: unknown, emptyValue: AggregateResultState): AggregateResultState {
  return toRecord(value) ?? emptyValue
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function toMutableRows(rows: readonly IDataRow[]): IDataRow[] {
  return rows as IDataRow[]
}

function toTreeRows(rows: readonly IDataRow[]): TreeNode[] {
  return rows as unknown as TreeNode[]
}

function asDataSource(view: DataView | null | undefined): IDataSource | undefined {
  return view as unknown as IDataSource | undefined
}

function buildNestedTreeRows(
  idField: string,
  parentIdField: string,
  textField: string,
  seedNodes: TreeManagerSeedNode[],
): IDataRow[] {
  return SparkData.createTreeManager({
    idField,
    parentIdField,
    textField,
    treeMode: 'nested',
  }, seedNodes).buildNestedTree() as unknown as IDataRow[]
}

// ============================================================
// § DataView 基础投影（SSOT）
// ============================================================

/**
 * 将 DataView 统一投影为容器可消费的 computed 状态。
 */
function useDataViewState(resolvedView: ResolvedViewRef): DataViewState {
  const tableName = computed<IDataSource['tableName']>(() => resolvedView.value?.tableName)
  const rows = computed<NonNullable<IDataSource['rows']>>(() => resolvedView.value?.rows ?? [])
  const columns = computed<IDataSource['columns']>(() => resolvedView.value?.columns ?? [])
  const currentRow = computed<IDataRow | null>(() => resolvedView.value?.currentRow ?? null)
  const selectedRows = computed<IDataRow[]>(() => resolvedView.value?.selectedRows ?? [])
  const _modelPerm = computed<IDataSource['_modelPerm']>(() => asDataSource(resolvedView.value)?._modelPerm)
  const value = computed<IDataSource['value']>(() => resolvedView.value?.value)
  const label = computed<IDataSource['label']>(() => resolvedView.value?.label)
  const labels = computed<IDataSource['labels']>(() => resolvedView.value?.labels ?? [])
  const primaryKey = computed<string | undefined>(() => resolvedView.value?.primaryKey)
  const isMultiSelect = computed<boolean>(() => resolvedView.value?.isMultiSelect === true)
  const requestState = computed<IDataSource['requestState']>(() => resolvedView.value?.requestState)
  const treeConfig = computed<TreeConfig | undefined>(() => resolvedView.value?.treeConfig)
  const aggregateResult = computed<AggregateResultState>(() => {
    const view = resolvedView.value
    if (!view) return EMPTY_AGGREGATE_RESULT
    return normalizeAggregateResult(view.aggregateResult, EMPTY_AGGREGATE_RESULT)
  })
  const selectionAggregateResult = computed<AggregateResultState>(() => {
    const view = resolvedView.value
    if (!view) return EMPTY_SELECTION_AGGREGATE_RESULT
    return normalizeAggregateResult(view.selectionAggregateResult, EMPTY_SELECTION_AGGREGATE_RESULT)
  })

  const total = computed<number>(() => resolvedView.value?.total ?? 0)
  const page = computed<number>(() => resolvedView.value?.page ?? 1)
  const pageSize = computed<number>(() => resolvedView.value?.pageSize ?? 20)

  const mutating = computed<boolean>(() => resolvedView.value?.mutating ?? false)
  const mutatingError = computed<Error | null>(() => resolvedView.value?.mutatingError ?? null)
  const loadingError = computed<Error | null>(() => resolvedView.value?.loadingError ?? null)

  return {
    tableName,
    rows,
    columns,
    currentRow,
    selectedRows,
    _modelPerm,
    value,
    label,
    labels,
    primaryKey,
    isMultiSelect,
    requestState,
    treeConfig,
    aggregateResult,
    selectionAggregateResult,
    total,
    page,
    pageSize,
    mutating,
    mutatingError,
    loadingError,
  }
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
function isAlreadyNested(rows: readonly unknown[]): boolean {
  return rows.some(row => {
    const record = toRecord(row)
    if (!record) return false
    return Array.isArray(record['children'])
  })
}

// ============================================================
// § RendererList 视图态
// ============================================================

/**
 * RendererList 与 DataView 的唯一对接层。
 *
 * 组件模板不直接访问 DataView 属性，全部通过此函数返回的 computeds 消费。
 */
export function useRendererListViewState(options: ViewStateOptions): RendererListViewState {
  const state = useDataViewState(options.resolvedView)

  return {
    ...state,
    /** rows 的视图别名，保持 RendererList 模板兼容 */
    listRows: state.rows,
  }
}

interface RendererListToolbarLike {
  children?: Array<SparkNode | string>
  position?: string
  class?: string | string[]
}

interface RendererListNodePropsLike {
  toolbar: RendererListToolbarLike | undefined
  actions: RendererListToolbarLike | undefined
  children: SparkNode['children'] | undefined
  useCard: boolean | undefined
  cardShadow: 'always' | 'hover' | 'never' | undefined
  columns: number | undefined
  gridColumns: number | undefined
  gridGap: number | string | undefined
  gridAutoRows: string | undefined
  itemColSpan: number | undefined
  itemRowSpan: number | undefined
}

interface RendererListNodeStateOptions {
  props: RendererListNodePropsLike
  listRows: ComputedRef<readonly IDataRow[]>
  hasDefaultSlot: ValueRef<boolean>
}

/**
 * RendererList 的 UI 组装状态（toolbar/actions/grid/card 等）。
 */
export function useRendererListNodeState(options: RendererListNodeStateOptions) {
  const toolbarNode = computed(() => options.props.toolbar)
  const actionsNode = computed(() => options.props.actions)
  const mergedChildren = computed<SparkNode[]>(() => getSparkNodeChildren(options.props.children))

  const showListItems = computed(
    () => options.listRows.value.length > 0 && (mergedChildren.value.length > 0 || options.hasDefaultSlot.value)
  )

  const itemActionConfigs = computed<SparkNode[]>(() => getSparkNodeChildren(actionsNode.value?.children))
  const itemActionsPositionValue = computed<'left' | 'right'>(() => {
    const position = actionsNode.value?.position
    return position === 'left' || position === 'right' ? position : 'right'
  })
  const itemActionsClassValue = computed(() => {
    const className = actionsNode.value?.class
    return typeof className === 'string' ? className : ''
  })
  const showItemActionsLeft = computed(
    () => itemActionConfigs.value.length > 0 && itemActionsPositionValue.value === 'left'
  )
  const showItemActionsRight = computed(
    () => itemActionConfigs.value.length > 0 && itemActionsPositionValue.value === 'right'
  )

  const itemBodyWrapperTag = computed(() => options.props.useCard ? 'el-card' : 'div')
  const itemBodyWrapperAttrs = computed<Record<string, unknown>>(() => {
    if (!options.props.useCard) return {}
    return {
      shadow: options.props.cardShadow,
      class: 'renderer-list-card',
    }
  })

  const normalizedGridGap = computed(() => {
    const value = options.props.gridGap
    return typeof value === 'number' ? `${value}px` : value
  })

  const normalizedItemColSpan = computed(() => {
    if (typeof options.props.itemColSpan === 'number' && Number.isFinite(options.props.itemColSpan)) {
      return Math.max(1, Math.trunc(options.props.itemColSpan))
    }
    if ((options.props.columns ?? 1) > 1) {
      return Math.max(1, Math.floor((options.props.gridColumns ?? 24) / (options.props.columns ?? 1)))
    }
    return options.props.gridColumns ?? 24
  })

  const normalizedItemRowSpan = computed(() => {
    if (typeof options.props.itemRowSpan === 'number' && Number.isFinite(options.props.itemRowSpan)) {
      return Math.max(1, Math.trunc(options.props.itemRowSpan))
    }
    return 1
  })

  const listStyle = computed<Record<string, string>>(() => {
    return {
      display: 'grid',
      gap: normalizedGridGap.value ?? '0',
      gridTemplateColumns: `repeat(${Math.max(options.props.gridColumns ?? 24, 1)}, minmax(0, 1fr))`,
      gridAutoRows: options.props.gridAutoRows ?? 'minmax(32px, auto)',
      alignItems: 'start',
    }
  })

  const itemGridStyle = computed<Record<string, string | number>>(() => ({
    gridColumn: `span ${normalizedItemColSpan.value} / span ${normalizedItemColSpan.value}`,
    gridRow: `span ${normalizedItemRowSpan.value} / span ${normalizedItemRowSpan.value}`,
    minWidth: 0,
  }))

  const rawItemActionsToolbarConfig = computed<SparkNode>(() => ({
    type: 'r-toolbar',
    children: itemActionConfigs.value,
  }))

  return {
    toolbarNode,
    actionsNode,
    mergedChildren,
    showListItems,
    itemActionConfigs,
    itemActionsPositionValue,
    itemActionsClassValue,
    showItemActionsLeft,
    showItemActionsRight,
    itemBodyWrapperTag,
    itemBodyWrapperAttrs,
    normalizedGridGap,
    normalizedItemColSpan,
    normalizedItemRowSpan,
    listStyle,
    itemGridStyle,
    rawItemActionsToolbarConfig,
  }
}

interface RendererTableToolbarLike {
  type?: string
  id?: string
  children?: SparkNode['children']
  dataKey?: string
  class?: unknown
  position?: string
}

interface RendererTableFilterLike {
  type?: string
  id?: string
  children?: SparkNode['children']
  class?: unknown
}

interface RendererTableNodePropsLike {
  children: SparkNode['children'] | undefined
  dataKey: string | undefined
  toolbar: RendererTableToolbarLike | undefined
  actions: RendererTableToolbarLike | undefined
  filter: RendererTableFilterLike | undefined
}

interface RendererTableNodeStateOptions {
  props: RendererTableNodePropsLike
}

/**
 * RendererTable 的 UI 节点组装状态（列节点、toolbar/actions/filter）。
 */
export function useRendererTableNodeState(options: RendererTableNodeStateOptions) {
  const normalizedContentChildNodes = computed<SparkNode[]>(() => {
    return getSparkNodeChildren(options.props.children).map((rawNode) => {
      const sourceProps = rawNode.props ?? {}
      const field = sourceProps['field'] ?? sourceProps['fieldName'] ?? sourceProps['prop'] ?? sourceProps['property']
      return (
        rawNode.type === 'r-row-fragment'
        || rawNode.type === 'r-column-group'
        || sourceProps['sortable'] !== undefined
        || typeof field !== 'string'
        || field.trim().length === 0
      )
        ? rawNode
        : { ...rawNode, props: { ...sourceProps, sortable: true } }
    })
  })

  const toolbarNode = computed<SparkNode | undefined>(() => {
    const toolbar = options.props.toolbar
    if (!toolbar) return undefined

    const { type: _type, id, children, dataKey: existingDataKey, ...propsFields } = toolbar
    const resolvedDataKey = (existingDataKey !== undefined && existingDataKey !== '')
      ? existingDataKey
      : (() => {
          const tableName = typeof options.props.dataKey === 'string' ? options.props.dataKey.split('@')[0] : undefined
          return tableName ? `${tableName}@currentRow` : undefined
        })()

    return {
      type: 'r-toolbar',
      ...(id !== undefined ? { id } : {}),
      props: {
        ...propsFields,
        ...(resolvedDataKey !== undefined ? { dataKey: resolvedDataKey } : {}),
      },
      ...(children !== undefined ? { children } : {}),
    }
  })

  const actionsNode = computed<SparkNode | undefined>(() => {
    const actions = options.props.actions
    if (!actions || (actions.children?.length ?? 0) === 0) return undefined
    const { type: _type, id, children, ...propsFields } = actions
    return {
      type: 'r-toolbar',
      ...(id !== undefined ? { id } : {}),
      props: {
        ...propsFields,
      },
      ...(children !== undefined ? { children } : {}),
    }
  })

  const actionScopeChildren = computed<SparkNode[]>(() => {
    return actionsNode.value ? [actionsNode.value] : []
  })

  const hasLeftActions = computed(
    () => actionsNode.value !== undefined && options.props.actions?.position === 'left'
  )
  const hasRightActions = computed(
    () => actionsNode.value !== undefined && (options.props.actions?.position ?? 'right') === 'right'
  )

  const hasFilters = computed(() => (options.props.filter?.children?.length ?? 0) > 0)

  const filterSparkNode = computed<SparkNode>(() => {
    const filter = options.props.filter ?? {}
    const { type: _type, id, children, class: userClass, ...rest } = filter
    return {
      type: 'r-filter',
      ...(id !== undefined ? { id } : {}),
      props: {
        autoFitMinWidth: '220px',
        itemSpan: 1,
        ...rest,
        class: ['renderer-table-filter-panel', userClass].filter(Boolean).join(' '),
      },
      children: children ?? [],
    }
  })

  return {
    normalizedContentChildNodes,
    toolbarNode,
    actionsNode,
    actionScopeChildren,
    hasLeftActions,
    hasRightActions,
    hasFilters,
    filterSparkNode,
  }
}

// ============================================================
// § RendererTable 视图态
// ============================================================

type RendererTableViewStateOptions = ViewStateOptions<{
  baseElTableProps: ValueRef<Record<string, unknown>>
}>

const DEFAULT_TABLE_TREE_PROPS: Readonly<Record<string, unknown>> = Object.freeze({
  children: 'children',
  hasChildren: 'hasChildren',
})

export function useRendererTableViewState(options: RendererTableViewStateOptions): RendererTableViewState {
  const state = useDataViewState(options.resolvedView)
  const { rows, treeConfig, primaryKey, selectedRows } = state

  // 表格数据：普通列表直接透传；树形配置下按需构造成嵌套 children
  const tableData = computed(() => buildTreeTableRows(
    options.resolvedView.value,
    rows.value,
    treeConfig.value,
    primaryKey.value,
  ))

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

  // ── 选中态辅助：优先主键匹配，回落引用判等 ─────────────────────────────────────────────
  const selectedRowIdSet = computed<Set<string | number>>(() => {
    const keyField = primaryKey.value
    const ids = new Set<string | number>()
    if (typeof keyField !== 'string' || keyField.length === 0) return ids
    for (const row of selectedRows.value) {
      const key = (row as Record<string, unknown>)[keyField]
      if (typeof key === 'string' || typeof key === 'number') ids.add(key)
    }
    return ids
  })

  /** 引用集合回退：当缺少主键时，使用对象引用判等维持选中态。 */
  const selectedRowRefSet = computed<Set<IDataRow>>(() => new Set(selectedRows.value))

  /** 判断当前行是否属于已选择集合。顺序：primaryKey 匹配优先 -> 引用匹配回退。 */
  function isSelectedRow(row: IDataRow): boolean {
    const keyField = primaryKey.value
    if (typeof keyField === 'string' && keyField.length > 0) {
      const key = (row as Record<string, unknown>)[keyField]
      if ((typeof key === 'string' || typeof key === 'number') && selectedRowIdSet.value.has(key)) return true
    }
    return selectedRowRefSet.value.has(row)
  }

  return {
    ...state,
    /** rows 的树形处理版本，直接传给 el-table :data */
    tableData,
    elTableProps,
    selectedRowIdSet,
    selectedRowRefSet,
    isSelectedRow,
  }
}

// ============================================================
// § RendererTable — 树形数据构建
// ============================================================

/**
 * 将平铺行数据按 treeConfig 构建成 el-table 可消费的嵌套 children 结构。
 * 优先复用 DataView 内部已同步的 treeManager；回退到手动组装 seedNodes。
 * 无树配置或数据已是嵌套时原样返回。
 */
function buildTreeTableRows(
  view: DataView | null | undefined,
  rows: readonly IDataRow[],
  treeConfig: TreeConfig | undefined,
  primaryKey: string | undefined,
): IDataRow[] {
  if (rows.length === 0) return []
  if (isAlreadyNested(rows)) return toMutableRows(rows)
  if (!treeConfig) return toMutableRows(rows)

  // 优先复用 DataView 内部已同步的 TreeManager，直接得到嵌套树
  if (view?.treeManager) {
    return view.treeManager.buildNestedTree() as unknown as IDataRow[]
  }

  const idFieldRaw = treeConfig.idField ?? primaryKey
  if (typeof idFieldRaw !== 'string' || idFieldRaw.length === 0) return toMutableRows(rows)
  const idField = idFieldRaw
  const parentIdField = treeConfig.parentIdField ?? 'parentId'
  const textField = treeConfig.textField ?? 'label'

  const seedNodes: TreeManagerSeedNode[] = []
  let hasParentLink = false

  for (const row of rows) {
    const record = toRecord(row)
    if (!record) continue

    const rawId = record[idField]
    if (typeof rawId !== 'string' && typeof rawId !== 'number') continue

    const parentId = resolveParentId(record[parentIdField])
    if (parentId !== null) hasParentLink = true

    seedNodes.push({
      ...record,
      id: rawId,
      parentId,
      name: readStringField(record, textField) ?? String(record[textField] ?? rawId),
    })
  }

  // 没有有效节点或不存在父子关系时保持平铺
  if (seedNodes.length === 0 || !hasParentLink) return toMutableRows(rows)

  return buildNestedTreeRows(idField, parentIdField, textField, seedNodes)
}

// ============================================================
// § RendererTree 视图态
// ============================================================

type RendererTreeViewStateOptions = ViewStateOptions<{
  toolbarConfigs: ValueRef<SparkNode[]>
  modelPermission: ValueRef<IModelPermission | undefined>
  nodeKey: ValueRef<string | undefined>
}>

export function useRendererTreeViewState(options: RendererTreeViewStateOptions): RendererTreeViewState {
  const state = useDataViewState(options.resolvedView)
  const { rows, treeConfig, currentRow } = state

  /** treeConfig 驱动的 id 字段名称，供 tree 构建和零代码 API 共用 */
  const treeIdField = computed<string>(() => treeConfig.value?.idField ?? 'id')

  /** node-key 优先级：props.nodeKey > primaryKey > treeConfig.idField > 'id' */
  const nodeKeyField = computed<string>(() =>
    options.nodeKey.value
    ?? state.primaryKey.value
    ?? treeConfig.value?.idField
    ?? 'id'
  )

  const labelField = computed(() =>
    treeConfig.value?.textField ?? 'label'
  )

  function getNodeLabel(data: unknown): string {
    const node = toRecord(data)
    if (!node) return '节点'
    const value = readStringField(node, labelField.value)
    if (value) return value
    return readStringField(node, 'label')
      ?? readStringField(node, 'name')
      ?? readStringField(node, 'title')
      ?? '节点'
  }

  const treeData = computed<TreeNode[]>(() => {
    const resolvedRows = toTreeRows(rows.value)
    if (resolvedRows.length === 0) return []
    if (isAlreadyNested(resolvedRows)) return resolvedRows
    if (!treeConfig.value) return resolvedRows

    const view = options.resolvedView.value
    const idField = treeIdField.value
    const parentIdField = treeConfig.value.parentIdField ?? 'parentId'
    const textField = treeConfig.value.textField ?? 'label'

    // 优先复用 DataView 内部已同步的 TreeManager，直接得到嵌套树
    if (view?.treeManager) {
      return view.treeManager.buildNestedTree() as unknown as TreeNode[]
    }

    const seedNodes: TreeManagerSeedNode[] = resolvedRows.flatMap(row => {
      const rawId = row[idField]
      if (typeof rawId !== 'string' && typeof rawId !== 'number') return []

      return [{
        ...row,
        id: rawId,
        parentId: resolveParentId(row[parentIdField]),
        name: getNodeLabel(row),
      }]
    })

    return toTreeRows(buildNestedTreeRows(idField, parentIdField, textField, seedNodes))
  })

  const elTreeFieldProps = computed(() => ({
    children: 'children',
    label: labelField.value,
  }))

  // ── 工具栏投影（每个节点需经 beforeRender 注入 currentRow/权限信息） ────────────────────────────────
  function resolveToolbarActionNode(node: SparkNode): SparkNode {
    const scopedRow = currentRow.value !== null && typeof currentRow.value === 'object' && !Array.isArray(currentRow.value)
      ? currentRow.value
      : undefined

    const beforeRender = resolveNodeBeforeRender(node, {
      row: scopedRow,
      data: scopedRow,
      dataSource: options.resolvedView.value,
      modelPermission: options.modelPermission.value,
      host: { type: 'r-tree-toolbar' },
    })

    return mergeNodeBeforeRenderProps(node, beforeRender.propsPatch, { markResolved: true })
  }

  const visibleToolbarConfigs = computed<SparkNode[]>(() =>
    options.toolbarConfigs.value
      .map(resolveToolbarActionNode)
      .filter(node => node.props?.['visible'] !== false)
  )
  const showToolbar = computed(() => visibleToolbarConfigs.value.length > 0)

  return {
    ...state,
    /** rows 的嵌套树处理版本，直接传给 el-tree :data */
    treeData,
    elTreeFieldProps,
    getNodeLabel,
    visibleToolbarConfigs,
    showToolbar,
    treeIdField,
    nodeKeyField,
  }
}

// ============================================================
// § RendererTable / RendererTree 视图副作用
// ============================================================

interface NativeTableLikeSync {
  setCurrentRow?: (row: IDataRow | null) => void
}

interface UseRendererTableViewEffectsOptions {
  currentRow: ComputedRef<IDataRow | null>
  nativeTableRef: ValueRef<NativeTableLikeSync | null>
}

/**
 * DataView -> el-table 当前行单向同步。
 */
export function useRendererTableViewEffects(options: UseRendererTableViewEffectsOptions): void {
  watch(
    options.currentRow,
    async (row) => {
      await nextTick()
      options.nativeTableRef.value?.setCurrentRow?.(row ?? null)
    },
  )
}

interface NativeTreeNodeLikeSync {
  expand?: () => void
}

interface NativeTreeLikeSync {
  setCurrentKey?: (key: string | number | null) => void
  getNode?: (key: string | number) => NativeTreeNodeLikeSync | undefined
}

interface TreeApiLikeSync {
  expandToNode: (key: string | number) => Promise<void>
}

interface UseRendererTreeViewEffectsOptions {
  currentRow: ComputedRef<IDataRow | null>
  treeData: ComputedRef<TreeNode[]>
  expandLevel: ValueRef<number | undefined>
  currentKey: ValueRef<string | number | null | undefined>
  expandToKey: ValueRef<string | number | null | undefined>
  nativeTreeRef: ValueRef<unknown>
  getNodeKey: (data: unknown) => string | number | null
  syncCurrentByKey: (key: string | number | null | undefined) => void
  treeApi: TreeApiLikeSync
}

/**
 * r-tree 运行时同步：当前行高亮、按层级展开、按 key 同步当前节点、展开到指定节点。
 */
export function useRendererTreeViewEffects(options: UseRendererTreeViewEffectsOptions): void {
  watch(
    options.currentRow,
    async (nextCurrentRow) => {
      await nextTick()
      const tree = options.nativeTreeRef.value as NativeTreeLikeSync | null
      if (!tree?.setCurrentKey) return
      const key = options.getNodeKey(nextCurrentRow)
      tree.setCurrentKey(key ?? null)
    },
    { immediate: true },
  )

  watch(
    [() => options.treeData.value, () => options.expandLevel.value],
    async ([nextTreeRows, expandLevel]) => {
      if (nextTreeRows.length === 0 || expandLevel === undefined) return
      await applyExpandLevel(options.treeData.value, options.nativeTreeRef, options.getNodeKey, expandLevel)
    },
    { immediate: true },
  )

  watch(
    [() => options.treeData.value.length, () => options.currentKey.value],
    async ([rowCount, currentKey]) => {
      if (rowCount === 0 || currentKey === undefined) return
      await nextTick()
      options.syncCurrentByKey(currentKey)
    },
    { immediate: true },
  )

  watch(
    [() => options.treeData.value.length, () => options.expandToKey.value],
    async ([rowCount, expandToKey]) => {
      if (rowCount === 0 || expandToKey === null || expandToKey === undefined) return
      await options.treeApi.expandToNode(expandToKey)
    },
    { immediate: true },
  )
}

async function applyExpandLevel(
  nextTreeData: TreeNode[],
  treeRef: ValueRef<unknown>,
  resolveNodeKey: (data: unknown) => string | number | null,
  level: number,
): Promise<void> {
  if (!Number.isFinite(level) || level < 2) return
  await nextTick()
  const tree = treeRef.value as NativeTreeLikeSync | null
  for (const key of collectExpandKeysByLevel(nextTreeData, resolveNodeKey, level)) {
    const nativeNode = tree?.getNode?.(key)
    nativeNode?.expand?.()
  }
}

function collectExpandKeysByLevel(
  nodes: TreeNode[],
  resolveNodeKey: (data: unknown) => string | number | null,
  targetLevel: number,
  currentLevel = 1,
): Array<string | number> {
  const result: Array<string | number> = []
  if (targetLevel <= 1) return result

  for (const node of nodes) {
    const key = resolveNodeKey(node)
    if (key !== null && currentLevel < targetLevel) {
      result.push(key)
    }
    const children = Array.isArray(node.children) ? node.children : []
    if (children.length > 0 && currentLevel < targetLevel) {
      result.push(...collectExpandKeysByLevel(children, resolveNodeKey, targetLevel, currentLevel + 1))
    }
  }

  return result
}

// ============================================================
// § RendererForm / RendererDetail 视图态
// ============================================================

/**
 * RendererForm / RendererDetail 与 DataView 的对接层。
 *
 * 表单/详情仅需 currentRow 投影（contextData 镜像驱动），
 * 通过本层统一接入，保持与 List / Table / Tree 的 view-state 模式一致。
 */
export function useRendererFormDetailViewState(options: ViewStateOptions): RendererFormDetailViewState {
  return useDataViewState(options.resolvedView)
}
