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
        :props="elTreeFieldProps"
        v-bind="$attrs"
        @node-click="handleNodeClick"
        @node-expand="handleNodeExpand"
        @node-collapse="handleNodeCollapse"
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
              <el-button v-if="effectiveAllowAppend" type="primary" size="small" link @click.stop="handleAppendNode(slotProps?.data)">添加</el-button>
              <el-button v-if="effectiveAllowDelete" type="danger" size="small" link @click.stop="handleDeleteNode(slotProps?.data)">删除</el-button>
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
import { computed, ref } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../_pkg'
import { getDockedChildren, nodeId, type SparkNode } from '../_pkg'
import type { ContainerDocks } from '../../types'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '../_pkg'
import { CONTEXT_DATA } from '../_pkg'
import type { RendererTreeApi } from '../_pkg'
import { useContainerDataSource, useContainerDataSourceEffects } from './useContainerDataSource'
import { useContainerToolbar } from './useContainerToolbar'
import type { ToolbarPosition } from './useContainerToolbar'
import RendererDataScope from './RendererDataScope.vue'

interface TreeNode {
  id?: string | number
  label?: string
  name?: string
  children?: TreeNode[]
  disabled?: boolean
  [key: string]: unknown
}

interface ElTreeNode {
  level: number
  expanded: boolean
  [key: string]: unknown
}

interface ElTreeComponent {
  [key: string]: unknown
}

interface Props {
  /** 组件类型（运行时缺省回落为 r-tree） */
  type?: string
  /** 组件属性透传占位（兼容 SparkNode 结构） */
  props?: Record<string, unknown>
  /** 节点唯一标识 */
  id?: string
  /** 停靠区域 */
  dock?: string
  /** 排序权重 */
  order?: number
  /** 数据绑定键，如 "TreeData@rows" */
  dataKey?: string
  /** 子节点（树节点内容配置） */
  children?: SparkNode[]
  /** 停靠区域显示配置 */
  docks?: ContainerDocks
  /** 允许追加子节点（自动生成追加按钮） */
  allowAppend?: boolean
  /** 允许删除节点（自动生成删除按钮） */
  allowDelete?: boolean
  /** 节点点击回调 */
  onNodeClick?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  /** 节点展开回调 */
  onNodeExpand?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  /** 节点折叠回调 */
  onNodeCollapse?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-tree',
})
const componentType = computed(() => props.type ?? 'r-tree')
/** dataKey 直接来自 Props */
const effectiveDataKey = computed(() => props.dataKey)

/** allowAppend / allowDelete 直接来自当前组件运行时输入 */
const effectiveAllowAppend = computed(() =>
  props.allowAppend ?? false
)
const effectiveAllowDelete = computed(() =>
  props.allowDelete ?? false
)
const hasNodeActions = computed(() => effectiveAllowAppend.value || effectiveAllowDelete.value)

/** 节点内容 children — 完全由父级（rule.json / 父组件）提供 */
const nodeContentChildren = computed<SparkNode[]>(() => {
  return getDockedChildren(props.children)
})
const dockedToolbar = computed(() => getDockedChildren(props.children, 'toolbar'))

// 接入 SPARK 能力链
const { sparkConsume, sparkProvide, registerApi, logger } = useSparkComponent({
  type: componentType.value,
  ...(props.id !== undefined ? { id: props.id } : {}),
  ...(props.dock !== undefined ? { dock: props.dock } : {}),
  ...(props.order !== undefined ? { order: props.order } : {}),
  ...(props.children !== undefined ? { children: props.children } : {}),
})
const pageDataSet = sparkConsume(PAGE_DATASET)

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

const treeData = computed(() => resolvedView.value?.rows as TreeNode[] ?? [])

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

sparkProvide(CONTEXT_DATA, {} as Record<string, unknown>)

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
    (nativeTreeRef.value as NativeTreeLike)?.setCurrentKey?.(key)
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

// 事件处理器
const handleNodeClick = (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  // 同步 currentRow 到 DataView，使 script.js 可通过 view.currentRow 访问当前节点
  resolvedView.value?.setCurrentRow(data as IDataRow)
  if (props.onNodeClick) props.onNodeClick(data, node, component)
}
const handleNodeExpand = (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  if (props.onNodeExpand) props.onNodeExpand(data, node, component)
}
const handleNodeCollapse = (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  if (props.onNodeCollapse) props.onNodeCollapse(data, node, component)
}

// ── 节点操作 ────────────────────────────────────────────────────────────

function handleAppendNode(data: unknown) {
  const node = data as Record<string, unknown> | undefined
  const nodeKey = node?.['id'] as string | number | null ?? null
  treeApi.appendNode(nodeKey, {})
}

function handleDeleteNode(data: unknown) {
  const node = data as Record<string, unknown> | undefined
  const nodeKey = node?.['id'] as string | number | undefined
  if (nodeKey == null) return
  treeApi.removeNode(nodeKey)
}
</script>

<style scoped>
.renderer-tree-layout {
  display: flex;
  gap: 12px;
  width: 100%;
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
}

.renderer-tree-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
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