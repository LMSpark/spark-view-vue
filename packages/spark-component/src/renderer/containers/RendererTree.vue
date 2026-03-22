<!--
/**
 * @skill r-tree
 * @description 树形数据容器，绑定 DataView 渲染嵌套树结构，支持懒加载、节点点击、展开/折叠事件
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @input { dataKey: string, props: { nodeKey?: string, lazy?: boolean } }
 * @example { "type": "r-tree", "dataKey": "departments@rows", "props": { "nodeKey": "id" } }
 */
-->
<template>
  <div :class="['renderer-tree-layout', `renderer-tree-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-tree-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="action.id ?? `r-tree-toolbar-${index}`"
        :config="action"
      />
      <slot
        name="toolbar"
        v-bind="getToolbarSlotScope()"
      />
    </div>

    <div class="renderer-tree-main">
      <el-tree
        :data="treeData"
        v-bind="$attrs"
        @node-click="handleNodeClick"
        @node-expand="handleNodeExpand"
        @node-collapse="handleNodeCollapse"
      >
        <template #default="slotProps">
          <span :class="['custom-tree-node', `custom-tree-node--${nodeActionsPositionValue}`]">
            <span v-if="showNodeActionsLeftValue" :class="['renderer-tree-node-actions', nodeActionsClassValue]">
              <SparkComponentRenderer
                v-for="(action, i) in getScopedNodeActions({ data: slotProps?.data, node: slotProps?.node })"
                :key="action.id ?? `r-tree-node-action-left-${i}`"
                :config="action"
              />
              <slot
                name="node-actions"
                v-bind="getNodeActionSlotScope(slotProps?.data, slotProps?.node)"
              />
            </span>

            <span class="renderer-tree-node-content">
              <!-- Config 驱动 —— 节点内容由 config.children 递归渲染 -->
              <template v-if="nodeContentChildren.length">
                <RendererTreeNodeScope
                  v-for="(child, i) in nodeContentChildren"
                  :key="child.id ?? `r-tree-node-${i}`"
                  :config="child"
                  :data="getNodeDataRecord(slotProps?.data)"
                  :node="slotProps?.node"
                  :data-source="resolvedDataSource"
                />
              </template>
              <!-- Template 驱动 —— 向后兼容 -->
              <RendererTreeNodeScope
                v-else
                :data="getNodeDataRecord(slotProps?.data)"
                :node="slotProps?.node"
                :data-source="resolvedDataSource"
              >
                <slot :node="slotProps?.node" :data="slotProps?.data">
                  <span class="node-label">{{ getNodeLabel(slotProps?.data) }}</span>
                </slot>
              </RendererTreeNodeScope>
            </span>

            <span v-if="showNodeActionsRightValue" :class="['renderer-tree-node-actions', nodeActionsClassValue]">
              <SparkComponentRenderer
                v-for="(action, i) in getScopedNodeActions({ data: slotProps?.data, node: slotProps?.node })"
                :key="action.id ?? `r-tree-node-action-right-${i}`"
                :config="action"
              />
              <slot
                name="node-actions"
                v-bind="getNodeActionSlotScope(slotProps?.data, slotProps?.node)"
              />
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
 * 内部通过 useSparkComponent + consume(PAGE_DATASET) 自行解析 dataKey，
 * 不再依赖 bindRules.ts 外部注入。
 */
import { computed, useSlots } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../_pkg'
import type { SparkNode } from '../_pkg'
import type { IDataSource, IDataRow, DataView, IModelPermission } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '../_pkg'
import { FIELD_CONTEXT, CONTEXT_DATA } from '../_pkg'
import { useContainerActions } from './useContainerActions'
import type { LateralActionPosition } from './useContainerActions'
import { useContainerInput } from './useContainerInput'
import { useContainerDataSource } from './useContainerDataSource'
import { useContainerSlots } from './useContainerSlots'
import { useContainerToolbar } from './useContainerToolbar'
import type { ToolbarPosition } from './useContainerToolbar'
import { createNodeActionSlotScope, createToolbarSlotScope } from './useContainerSlotScopes'
import RendererTreeNodeScope from './RendererTreeNodeScope.vue'

type NodeActionsPosition = LateralActionPosition

interface TreeNode {
  id?: string | number
  label: string
  children?: TreeNode[]
  disabled?: boolean
  [key: string]: string | number | boolean | TreeNode[] | undefined
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
  /** SPARK 配置驱动 */
  config?: SparkNode
  /** 数据绑定键，如 "TreeData@rows" */
  dataKey?: string
  /** bindRules 提取的子组件配置 */
  sparkChildren?: SparkNode[]
  /** 静态树节点数据（优先用 dataKey） */
  data?: TreeNode[]
  /** 动态数据源 */
  dataSource?: IDataSource | DataView | undefined
  /** 工具栏按钮配置 */
  toolbar?: SparkNode[]
  /** 工具栏位置 */
  toolbarPosition?: ToolbarPosition
  /** 工具栏 CSS 类名 */
  toolbarClass?: string
  /** 节点操作按钮配置 */
  nodeActions?: SparkNode[]
  /** 节点操作位置 */
  nodeActionsPosition?: NodeActionsPosition
  /** 节点操作区 CSS 类名 */
  nodeActionsClass?: string
  /** 节点点击回调 */
  onNodeClick?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  /** 节点展开回调 */
  onNodeExpand?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  /** 节点折叠回调 */
  onNodeCollapse?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  /** 透传到 el-tree 的额外属性 */
  [key: string]: unknown
}

const props = defineProps<Props>()
const slots = useSlots()

const { effectiveDataKey, mergedChildren } = useContainerInput({
  config: computed(() => props.config),
  dataKey: computed(() => props.dataKey),
  sparkChildren: computed(() => props.sparkChildren),
})

const nodeContentChildren = computed<SparkNode[]>(() => mergedChildren.value)

/** 提取树节点显示文本，避免模板中使用 as any */
function getNodeLabel(data: unknown): string {
  const node = data as TreeNode | undefined
  return node?.label ?? (node?.['name'] as string | undefined) ?? (node?.['title'] as string | undefined) ?? '节点'
}

function getNodeDataRecord(data: unknown): Record<string, unknown> {
  if (data !== null && typeof data === 'object') return data as Record<string, unknown>
  return {}
}

// 接入 SPARK 能力链
const { consume, provide: sparkProvide, logger } = useSparkComponent(
  props.config ?? { type: 'r-tree' }
)
const pageDataSet = consume(PAGE_DATASET)

const { resolvedDataSource } = useContainerDataSource<IDataSource>({
  dataKey: effectiveDataKey,
  pageDataSet,
  fallbackSource: computed(() => props.dataSource ?? null),
  mapView: view => view as IDataSource,
  provideDataSource: source => sparkProvide(DATA_SOURCE, source),
  logger,
  logPrefix: 'RendererTree',
})

const treeData = computed(() => {
  // 兼容三种来源：
  // 1. 直接传入数组（bindRules 从 pageData 注入的裸数组）
  // 2. IDataSource / DataView（.rows 属性）
  // 3. props.data 直传
  const ds = resolvedDataSource.value as unknown
  if (Array.isArray(ds)) return ds as TreeNode[]
  const dsTyped = ds as IDataSource | undefined
  if (dsTyped && Array.isArray(dsTyped.rows)) return dsTyped.rows as TreeNode[]
  return props.data ?? []
})

const modelPermission = computed<IModelPermission | undefined>(() => resolvedDataSource.value?._modelPerm)

const {
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
} = useContainerToolbar({
  config: computed(() => props.config),
  toolbar: computed(() => props.toolbar),
  toolbarPosition: computed(() => props.toolbarPosition),
  toolbarClass: computed(() => props.toolbarClass),
  modelPermission,
  slots,
})

const {
  actionPositionValue: nodeActionsPositionValue,
  actionClassValue: nodeActionsClassValue,
  showActionsLeft: showNodeActionsLeft,
  showActionsRight: showNodeActionsRight,
  getScopedActionConfigs: getScopedNodeActions,
} = useContainerActions<{ data: unknown, node: unknown }>({
  config: computed(() => props.config),
  actionConfigs: computed(() => props.nodeActions),
  actionPosition: computed(() => props.nodeActionsPosition),
  actionClass: computed(() => props.nodeActionsClass),
  actionPropKey: 'nodeActions',
  actionPositionPropKey: 'nodeActionsPosition',
  actionClassPropKey: 'nodeActionsClass',
  modelPermission,
  resolveScope: ({ data, node }) => ({
    row: data as IDataRow | undefined,
    listenerArgs: [data, node],
    scopedProps: { data, node },
  }),
})
const {
  showActionsLeftValue: showNodeActionsLeftValue,
  showActionsRightValue: showNodeActionsRightValue,
} = useContainerSlots({
  slots,
  actionSlotName: 'node-actions',
  actionPosition: nodeActionsPositionValue,
  showActionsLeft: showNodeActionsLeft,
  showActionsRight: showNodeActionsRight,
})

function getToolbarSlotScope() {
  return createToolbarSlotScope({
    dataSource: resolvedDataSource.value,
    modelPermission: modelPermission.value,
  }, {
    rows: treeData.value,
  })
}

function getNodeActionSlotScope(data: unknown, node: unknown) {
  return createNodeActionSlotScope({
    dataSource: resolvedDataSource.value,
    modelPermission: modelPermission.value,
    data,
    node,
  })
}

// 向字段子组件提供渲染上下文（同步，先于 watcher）
sparkProvide(FIELD_CONTEXT, 'tree')
sparkProvide(CONTEXT_DATA, {} as Record<string, unknown>)

// 事件处理器
const handleNodeClick = (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  if (props.onNodeClick) props.onNodeClick(data, node, component)
}
const handleNodeExpand = (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  if (props.onNodeExpand) props.onNodeExpand(data, node, component)
}
const handleNodeCollapse = (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  if (props.onNodeCollapse) props.onNodeCollapse(data, node, component)
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

.custom-tree-node--left {
  flex-direction: row;
}

.custom-tree-node--right {
  flex-direction: row;
}

.renderer-tree-node-content {
  min-width: 0;
  flex: 1;
}

.renderer-tree-node-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.node-label {
  font-size: 14px;
  color: #303133;
}
</style>