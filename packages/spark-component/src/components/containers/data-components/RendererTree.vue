<!--
/**
 * @skill r-tree
 * @description 树形数据容器，绑定 DataView 渲染嵌套树结构，支持 dock 分区工具栏、懒加载、节点点击、展开/折叠事件
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @input { dataKey: string, props: { docks?: { toolbar?: { position?: 'top'|'bottom'|'left'|'right', class?: string } }, nodeKey?: string, lazy?: boolean } }
 * @example { "type": "r-tree", "dataKey": "departments@rows", "props": { "nodeKey": "id" } }
 */
-->
<template>
  <div :class="['renderer-tree-layout', `renderer-tree-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-tree-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="nodeId(action) ?? `r-tree-toolbar-${index}`"
        :config="action"
      />
    </div>

    <div class="renderer-tree-main">
      <el-tree
        ref="nativeTreeRef"
        :data="treeData"
        :node-key="nodeKeyField"
        :props="elTreeFieldProps"
        v-bind="$attrs"
        @node-click="handleNodeClick"
        @node-expand="handleNodeExpand"
        @node-collapse="handleNodeCollapse"
        @node-drop="handleNodeDrop"
      >
        <template #default="slotProps">
          <span class="custom-tree-node">
            <RendererDataScope
              v-if="nodeContentChildren.length > 0"
              type="r-data-scope"
              :children="nodeContentChildren"
              :data="(slotProps?.data as IDataRow) ?? {}"
            />
            <slot v-else :node="slotProps?.node" :data="slotProps?.data">
              <span class="node-label">{{ getNodeLabel(slotProps?.data) }}</span>
            </slot>
            <span v-if="hasNodeActions" class="tree-node-actions">
              <template v-for="(action, index) in getScopedNodeActions({ row: ((slotProps?.data as IDataRow) ?? {}), index: 0 })" :key="nodeId(action) ?? `r-tree-node-action-${index}`">
                <el-button
                  v-if="isBuiltinAction(action)"
                  :type="getBuiltinButtonType(action)"
                  :size="getBuiltinButtonSize(action)"
                  :plain="getBuiltinButtonPlain(action)"
                  :text="getBuiltinButtonText(action)"
                  :link="getBuiltinButtonLink(action)"
                  :disabled="isBuiltinNodeActionDisabled(action, ((slotProps?.data as IDataRow) ?? {}), 0)"
                  :class="getBuiltinButtonClass(action)"
                  @click="handleBuiltinNodeAction(action, ((slotProps?.data as IDataRow) ?? {}), 0)"
                >{{ getBuiltinActionLabel(action) }}</el-button>
                <SparkComponentRenderer
                  v-else
                  :config="action"
                />
              </template>
              <el-button v-if="shouldShowLegacyAppend((slotProps?.data as IDataRow) ?? {})" type="primary" size="small" link @click.stop="handleAppendNode(slotProps?.data)">添加</el-button>
              <el-button v-if="shouldShowLegacyDelete((slotProps?.data as IDataRow) ?? {})" type="danger" size="small" link @click.stop="handleDeleteNode(slotProps?.data)">删除</el-button>
            </span>
          </span>
        </template>
      </el-tree>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * RendererTree - 树形容器组件
 *
 * 内部通过 useSparkComponent + sparkConsume(PAGE_DATASET) 自行解析 dataKey。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../../internal'
import { getDockedChildren, nodeId, type SparkNode } from '../../internal'
import type { ContainerDocks } from '../../../core/types'
import { SparkData, type IDataRow, type DataView } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '../../internal'
import { CONTEXT_DATA, FIELD_CONTEXT } from '../../internal'
import type { RendererTreeApi } from '../../internal'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import { useContainerActions } from '../actions/useContainerActions'
import {
  isBuiltinAction,
  isBuiltinActionDisabled as _isBuiltinActionDisabled,
  getBuiltinActionLabel,
  getBuiltinButtonType,
  getBuiltinButtonSize,
  getBuiltinButtonPlain,
  getBuiltinButtonText,
  getBuiltinButtonLink,
  getBuiltinButtonClass,
  createBuiltinActionHandler,
} from '../builtin-actions'
import { useContainerDataSource, useContainerDataSourceEffects } from '../data/useContainerDataSource'
import { useContainerToolbar } from '../layout/useContainerToolbar'
import type { ToolbarPosition } from '../layout/useContainerToolbar'
import RendererDataScope from './RendererDataScope.vue'

interface TreeNode {
  id?: string | number
  label?: string
  name?: string
  children?: TreeNode[]
  disabled?: boolean
  [key: string]: unknown
}

interface TreeManagerSeedNode extends Record<string, unknown> {
  id: string | number
  name: string
  parentId?: string | number | null
}

interface ElTreeNode {
  level: number
  expanded: boolean
  data?: Record<string, unknown>
  parent?: ElTreeNode | null
  [key: string]: unknown
}

interface ElTreeComponent {
  [key: string]: unknown
}

interface TreeEventControl {
  cancel: boolean
}

type TreeEventHandler = (
  data: TreeNode,
  node: ElTreeNode,
  component: ElTreeComponent,
  control: TreeEventControl,
) => void | Promise<void>

type TreeNodeActionHandler = (
  data: TreeNode,
  control: TreeEventControl,
) => void | Promise<void>

interface Props {
  /** 组件类型（运行时缺省回落为 r-tree） */
  type?: string
  /** 组件属性透传占位（兼容 SparkNode 结构） */
  props?: Record<string, unknown>
  /** 节点唯一标识 */
  id?: string
  /** 数据绑定键，如 "TreeData@rows" */
  dataKey?: string
  /** 节点主键字段名，默认取 treeConfig.idField */
  nodeKey?: string
  /** 当前选中节点 ID */
  currentKey?: string | number | null
  /** 初始化展开并定位到目标节点 ID */
  expandToKey?: string | number | null
  /** 初始化自动展开到指定层级（根节点为第 1 层） */
  expandLevel?: number
  /** 子节点（树节点内容配置） */
  children?: SparkNode[]
  /** 停靠区域显示配置 */
  docks?: ContainerDocks
  /** 允许追加子节点（自动生成追加按钮） */
  allowAppend?: boolean
  /** 允许删除节点（自动生成删除按钮） */
  allowDelete?: boolean
  /** 节点点击回调 */
  onNodeClick?: TreeEventHandler
  /** 节点展开回调 */
  onNodeExpand?: TreeEventHandler
  /** 节点折叠回调 */
  onNodeCollapse?: TreeEventHandler
  /** 节点追加前回调 */
  onNodeAppend?: TreeNodeActionHandler
  /** 节点删除前回调 */
  onNodeDelete?: TreeNodeActionHandler
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-tree',
})
/** dataKey 直接来自 Props */
const effectiveDataKey = computed(() => props.dataKey)

/** allowAppend / allowDelete 直接来自当前组件运行时输入 */
const effectiveAllowAppend = computed(() =>
  props.allowAppend ?? false
)
const effectiveAllowDelete = computed(() =>
  props.allowDelete ?? false
)

/** 节点内容 children — 完全由父级（rule.json / 父组件）提供 */
const nodeContentChildren = computed<SparkNode[]>(() => {
  return getDockedChildren(props.children)
})
const dockedToolbar = computed(() => getDockedChildren(props.children, 'toolbar'))
const dockedNodeActions = computed(() => getDockedChildren(props.children, 'actions'))
const hasLegacyNodeActions = computed(() =>
  dockedNodeActions.value.length === 0 && (effectiveAllowAppend.value || effectiveAllowDelete.value)
)
const hasNodeActions = computed(() => dockedNodeActions.value.length > 0 || hasLegacyNodeActions.value)

// 接入 SPARK 能力链
const { sparkConsume, sparkProvide, registerApi, logger } = useSparkComponent(props)
const pageDataSet = sparkConsume(PAGE_DATASET)
const pageService = sparkConsume(PAGE_SERVICE)

const { resolvedDataSource: resolvedView, modelPermission } = useContainerDataSource<DataView>({
  dataKey: effectiveDataKey,
  pageDataSet,
  mapView: view => view,
})

useContainerDataSourceEffects({
  resolvedDataSource: resolvedView,
  provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
  logger,
  logPrefix: 'RendererTree',
})

const nodeKeyField = computed(() =>
  props.nodeKey ?? resolvedView.value?.primaryKey ?? resolvedView.value?.treeConfig?.idField ?? 'id'
)

const treeIdField = computed(() =>
  resolvedView.value?.treeConfig?.idField ?? 'id'
)

const treeData = computed<TreeNode[]>(() => {
  const rows = resolvedView.value?.rows as TreeNode[] ?? []
  if (rows.length === 0) return []
  if (rows.some(row => Array.isArray(row?.children))) return rows
  if (!resolvedView.value?.treeConfig) return rows

  const seedNodes: TreeManagerSeedNode[] = rows.flatMap(row => {
    const rawId = row?.[treeIdField.value]
    if (typeof rawId !== 'string' && typeof rawId !== 'number') {
      return []
    }

    const rawParentId = row?.[resolvedView.value?.treeConfig?.parentIdField ?? 'parentId']
    const parentId = typeof rawParentId === 'string' || typeof rawParentId === 'number'
      ? rawParentId
      : rawParentId == null
        ? null
        : String(rawParentId)

    return [{
      ...row,
      id: rawId,
      parentId,
      name: getNodeLabel(row),
    }]
  })

  const treeManager = SparkData.createTreeManager({
    idField: treeIdField.value,
    parentIdField: resolvedView.value?.treeConfig?.parentIdField ?? 'parentId',
    textField: resolvedView.value?.treeConfig?.textField ?? 'label',
    treeMode: 'nested',
  }, seedNodes)

  return treeManager.buildNestedTree() as TreeNode[]
})

/** 从 DataView.treeConfig.textField 推导 el-tree 的字段映射 */
const labelField = computed(() =>
  resolvedView.value?.treeConfig?.textField ?? 'label'
)

/** 传给 el-tree 的 props，对齐 TreeManager.textField → el-tree label 映射 */
const elTreeFieldProps = computed(() => ({
  children: 'children',
  label: labelField.value,
}))

/** 提取树节点显示文本，使用 treeConfig.textField 对齐 TreeManager */
function getNodeLabel(data: unknown): string {
  const node = data as Record<string, unknown> | undefined
  if (!node) return '节点'
  const field = labelField.value
  const val = node[field]
  if (typeof val === 'string') return val
  // fallback: 尝试 label / name / title
  return (node['label'] as string | undefined)
    ?? (node['name'] as string | undefined)
    ?? (node['title'] as string | undefined)
    ?? '节点'
}

const {
  toolbarPositionValue, toolbarClassValue, visibleToolbarConfigs, showToolbar,
} = useContainerToolbar({
  toolbar: computed(() => dockedToolbar.value),
  toolbarPosition: computed(() => props.docks?.toolbar?.position as ToolbarPosition | undefined),
  toolbarClass: computed(() => props.docks?.toolbar?.class),
  modelPermission,
})

const {
  getScopedActionConfigs: getScopedNodeActions,
} = useContainerActions<{ row: IDataRow, index: number }>({
  actionConfigs: computed(() => [...dockedNodeActions.value]),
  actionPosition: computed(() => 'right'),
  actionClass: computed(() => props.docks?.actions?.class),
  modelPermission,
  resolveScope: ({ row, index }) => ({
    row,
    listenerArgs: [row, index],
    scopedProps: {
      row,
      rowIndex: index,
      $index: index,
      data: row,
    },
  }),
})

const builtinHandler = createBuiltinActionHandler({
  getView: () => resolvedView.value,
  getPageService: () => pageService,
  getLogger: () => logger,
  hasRemoteListApi: (view: DataView) => Boolean(view.dataTable?.api?.list),
})

function isBuiltinNodeActionDisabled(action: SparkNode, row: IDataRow, index: number): boolean {
  return _isBuiltinActionDisabled(action, resolvedView.value, { row, index })
}

function handleBuiltinNodeAction(action: SparkNode, row: IDataRow, index: number): void {
  builtinHandler.handleRow(action, row, index)
}

function shouldShowLegacyAppend(row: IDataRow): boolean {
  return hasLegacyNodeActions.value
    && effectiveAllowAppend.value
    && modelPermission.value?.allowCreate !== false
    && row._perm?.allowCreateChild !== false
}

function shouldShowLegacyDelete(row: IDataRow): boolean {
  return hasLegacyNodeActions.value
    && effectiveAllowDelete.value
    && row._perm?.allowDelete !== false
}

sparkProvide(CONTEXT_DATA, {} as Record<string, unknown>)
sparkProvide(FIELD_CONTEXT, 'tree')

// ── r-tree 包装 API ──────────────────────────────────────────────────────

const nativeTreeRef = ref<unknown>(null)

interface NativeTreeLike {
  getCurrentNode?: () => unknown
  setCurrentKey?: (key: string | number | null) => void
  filter?: (value: string) => void
  getCheckedKeys?: (leafOnly?: boolean) => Array<string | number>
  setCheckedKeys?: (keys: Array<string | number>, leafOnly?: boolean) => void
  append?: (data: unknown, parentNode: unknown) => void
  insertBefore?: (data: unknown, refNode: unknown) => void
  insertAfter?: (data: unknown, refNode: unknown) => void
  remove?: (nodeOrData: unknown) => void
  getNode?: (key: string | number) => unknown
}

interface NativeTreeNodeLike {
  expand?: () => void
  data?: Record<string, unknown>
}

function getNodeKey(data: unknown): string | number | null {
  const node = data as Record<string, unknown> | null | undefined
  const key = node?.[nodeKeyField.value]
  return typeof key === 'string' || typeof key === 'number' ? key : null
}

function collectExpandKeysByLevel(nodes: TreeNode[], targetLevel: number, currentLevel = 1): Array<string | number> {
  const result: Array<string | number> = []
  if (targetLevel <= 1) return result
  for (const node of nodes) {
    const key = getNodeKey(node)
    if (key !== null && currentLevel < targetLevel) {
      result.push(key)
    }
    const children = Array.isArray(node?.children) ? node.children : []
    if (children.length > 0 && currentLevel < targetLevel) {
      result.push(...collectExpandKeysByLevel(children, targetLevel, currentLevel + 1))
    }
  }
  return result
}

async function applyExpandLevel(level: number): Promise<void> {
  if (!Number.isFinite(level) || level < 2) return
  await nextTick()
  const tree = nativeTreeRef.value as NativeTreeLike | null
  for (const key of collectExpandKeysByLevel(treeData.value, level)) {
    const nativeNode = tree?.getNode?.(key) as NativeTreeNodeLike | undefined
    nativeNode?.expand?.()
  }
}

function syncCurrentByKey(key: string | number | null | undefined): void {
  const tree = nativeTreeRef.value as NativeTreeLike | null
  if (key == null) {
    resolvedView.value?.setCurrentRowById(null)
    tree?.setCurrentKey?.(null)
    return
  }
  resolvedView.value?.setCurrentRowById(key)
  tree?.setCurrentKey?.(key)
}

const treeApi: RendererTreeApi = {
  getDataSource() {
    return resolvedView.value ?? null
  },
  getTreeData() {
    return treeData.value as IDataRow[]
  },
  getNativeTree() {
    return nativeTreeRef.value
  },
  getCurrentNode() {
    return ((nativeTreeRef.value as NativeTreeLike)?.getCurrentNode?.() as IDataRow | null) ?? null
  },
  setCurrentKey(key) {
    syncCurrentByKey(key)
  },
  async expandToNode(key) {
    const view = resolvedView.value
    if (!view) return

    const path = await view.loadTreePath(key)
    await view.expandTreeToNode(key)
    await nextTick()

    const tree = nativeTreeRef.value as NativeTreeLike | null
    for (const pathId of path.pathIds) {
      const nativeNode = tree?.getNode?.(pathId) as NativeTreeNodeLike | undefined
      nativeNode?.expand?.()
    }

    syncCurrentByKey(key)
  },
  filter(keyword) {
    (nativeTreeRef.value as NativeTreeLike)?.filter?.(keyword)
  },
  getCheckedKeys() {
    return (nativeTreeRef.value as NativeTreeLike)?.getCheckedKeys?.() ?? []
  },
  setCheckedKeys(keys) {
    (nativeTreeRef.value as NativeTreeLike)?.setCheckedKeys?.(keys)
  },
  async addRow(row) {
    const view = resolvedView.value
    if (!view) return null
    return await view.addRow(row)
  },
  async editRowById(id, patch) {
    const view = resolvedView.value
    if (!view) return false
    return await view.editRowById(id, patch)
  },
  async removeRow(id) {
    const view = resolvedView.value
    if (!view) return false
    return await view.removeRow(id)
  },
  async moveNode(nodeId, newParentId, index) {
    const view = resolvedView.value
    if (!view) return null
    return await view.moveTreeNode(nodeId, newParentId, index)
  },

  // ── 编辑操作 ──────────────────────────────────────────────────────────────

  appendNode(parentKey, nodeData) {
    const tree = nativeTreeRef.value as NativeTreeLike | null
    if (!tree) return
    // parentKey 为 null → 追加到根级（el-tree.append 第二个参数传 null/undefined）
    const parentNode = parentKey != null ? tree.getNode?.(parentKey) : null
    tree.append?.(nodeData, parentNode ?? undefined)
  },
  insertBefore(refKey, nodeData) {
    const tree = nativeTreeRef.value as NativeTreeLike | null
    if (!tree) return
    const refNode = tree.getNode?.(refKey)
    if (refNode) tree.insertBefore?.(nodeData, refNode)
  },
  insertAfter(refKey, nodeData) {
    const tree = nativeTreeRef.value as NativeTreeLike | null
    if (!tree) return
    const refNode = tree.getNode?.(refKey)
    if (refNode) tree.insertAfter?.(nodeData, refNode)
  },
  updateNode(key, patch) {
    const tree = nativeTreeRef.value as NativeTreeLike | null
    if (!tree) return false
    const elNode = tree.getNode?.(key) as { data?: Record<string, unknown> } | undefined
    if (!elNode?.data) return false
    Object.assign(elNode.data, patch)
    return true
  },
  removeNode(key) {
    const tree = nativeTreeRef.value as NativeTreeLike | null
    if (!tree) return false
    const elNode = tree.getNode?.(key)
    if (!elNode) return false
    tree.remove?.(elNode)
    return true
  },

  // ── 声明式属性 ──────────────────────────────────────────────────────────

  getAllowAppend() {
    return effectiveAllowAppend.value
  },
  getAllowDelete() {
    return effectiveAllowDelete.value
  },
}

registerApi(treeApi)

defineExpose(treeApi)

watch(
  () => resolvedView.value?.currentRow,
  async currentRow => {
    await nextTick()
    const tree = nativeTreeRef.value as NativeTreeLike | null
    if (!tree?.setCurrentKey) return
    const key = getNodeKey(currentRow)
    tree.setCurrentKey(key ?? null)
  },
  { immediate: true }
)

watch(
  [() => treeData.value, () => props.expandLevel],
  async ([rows, expandLevel]) => {
    if (rows.length === 0 || expandLevel == null) return
    await applyExpandLevel(expandLevel)
  },
  { immediate: true }
)

watch(
  [() => treeData.value.length, () => props.currentKey],
  async ([rowCount, currentKey]) => {
    if (rowCount === 0 || currentKey === undefined) return
    await nextTick()
    syncCurrentByKey(currentKey)
  },
  { immediate: true }
)

watch(
  [() => treeData.value.length, () => props.expandToKey],
  async ([rowCount, expandToKey]) => {
    if (rowCount === 0 || expandToKey == null) return
    await treeApi.expandToNode(expandToKey)
  },
  { immediate: true }
)

// 事件处理器
function createTreeEventControl(): TreeEventControl {
  return { cancel: false }
}

async function runTreeEvent(
  handler: TreeEventHandler | undefined,
  data: TreeNode,
  node: ElTreeNode,
  component: ElTreeComponent,
  autoHandle?: () => void,
): Promise<void> {
  const control = createTreeEventControl()
  if (handler) {
    await handler(data, node, component, control)
  }
  if (!control.cancel) {
    autoHandle?.()
  }
}

async function runTreeNodeAction(
  handler: TreeNodeActionHandler | undefined,
  data: TreeNode,
  autoHandle?: () => void,
): Promise<void> {
  const control = createTreeEventControl()
  if (handler) {
    await handler(data, control)
  }
  if (!control.cancel) {
    autoHandle?.()
  }
}

const handleNodeClick = async (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  await runTreeEvent(props.onNodeClick, data, node, component, () => {
    const key = getNodeKey(data)
    if (key === null) {
      logger.warn('RendererTree node-click 跳过自动选中：节点缺少主键', { nodeKey: nodeKeyField.value, treeIdField: treeIdField.value })
      return
    }
    resolvedView.value?.setCurrentRowById(key)
  })
}
const handleNodeExpand = async (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  await runTreeEvent(props.onNodeExpand, data, node, component)
}
const handleNodeCollapse = async (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  await runTreeEvent(props.onNodeCollapse, data, node, component)
}

const handleNodeDrop = async (draggingNode: ElTreeNode, dropNode: ElTreeNode, dropType: string) => {
  const view = resolvedView.value as (DataView & {
    moveTreeNode?: (nodeId: string | number, newParentId: string | number | null, index?: number) => Promise<IDataRow | null>
  }) | null
  if (!view || typeof view.moveTreeNode !== 'function') return

  const draggedKey = getNodeKey(draggingNode?.data)
  if (draggedKey == null) return

  const parentIdField = resolvedView.value?.treeConfig?.parentIdField ?? 'parentId'
  let newParentId: string | number | null = null
  if (dropType === 'inner') {
    newParentId = getNodeKey(dropNode?.data)
  } else {
    const rawParentId = dropNode?.data?.[parentIdField]
    newParentId = typeof rawParentId === 'string' || typeof rawParentId === 'number'
      ? rawParentId
      : rawParentId == null
        ? null
        : String(rawParentId)
  }

  await view.moveTreeNode(draggedKey, newParentId, -1)
}

// ── 节点操作 ────────────────────────────────────────────────────────────

async function handleAppendNode(data: unknown) {
  const node = data as Record<string, unknown> | undefined
  const nodeKey = getNodeKey(node)
  await runTreeNodeAction(props.onNodeAppend, (node ?? {}) as TreeNode, () => {
    treeApi.appendNode(nodeKey, {})
  })
}

async function handleDeleteNode(data: unknown) {
  const node = data as Record<string, unknown> | undefined
  const nodeKey = getNodeKey(node)
  if (nodeKey == null) return
  await runTreeNodeAction(props.onNodeDelete, (node ?? {}) as TreeNode, () => {
    treeApi.removeNode(nodeKey)
  })
}
</script>

<style scoped>
.renderer-tree-layout {
  display: flex;
  gap: 12px;
  width: 100%;
  min-height: 0;
}

.renderer-tree-layout--top,
.renderer-tree-layout--bottom {
  flex-direction: column;
}

.renderer-tree-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-tree-layout--right {
  flex-direction: row-reverse;
}

.renderer-tree-main {
  min-width: 0;
  flex: 1;
  min-height: 0;
}

.renderer-tree-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.renderer-tree-layout--left .renderer-tree-toolbar,
.renderer-tree-layout--right .renderer-tree-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.custom-tree-node {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 8px;
  padding-right: 8px;
}

.tree-node-actions {
  display: inline-flex;
  gap: 4px;
  margin-left: auto;
}

.node-label {
  font-size: 14px;
  color: #303133;
}
</style>
