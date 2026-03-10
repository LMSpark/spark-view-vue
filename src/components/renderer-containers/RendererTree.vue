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
    <div v-if="hasToolbar" :class="['renderer-tree-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="action.id ?? `r-tree-toolbar-${index}`"
        :config="action"
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
            <span v-if="showNodeActionsLeft" :class="['renderer-tree-node-actions', nodeActionsClassValue]">
              <SparkComponentRenderer
                v-for="(action, i) in getScopedNodeActions({ data: slotProps?.data, node: slotProps?.node })"
                :key="action.id ?? `r-tree-node-action-left-${i}`"
                :config="action"
              />
            </span>

            <span class="renderer-tree-node-content">
              <!-- Config 驱动 —— 节点内容由 config.children 递归渲染 -->
              <template v-if="configChildren.length">
                <SparkComponentRenderer
                  v-for="(child, i) in configChildren"
                  :key="child.id ?? `r-tree-node-${i}`"
                  :config="{ ...child, props: { ...child.props, node: slotProps?.node, data: slotProps?.data } }"
                />
              </template>
              <!-- Template 驱动 —— 向后兼容 -->
              <slot v-else :node="slotProps?.node" :data="slotProps?.data">
                <span class="node-label">{{ getNodeLabel(slotProps?.data) }}</span>
              </slot>
            </span>

            <span v-if="showNodeActionsRight" :class="['renderer-tree-node-actions', nodeActionsClassValue]">
              <SparkComponentRenderer
                v-for="(action, i) in getScopedNodeActions({ data: slotProps?.data, node: slotProps?.node })"
                :key="action.id ?? `r-tree-node-action-right-${i}`"
                :config="action"
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
import { computed } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import type { IDataSource, IDataRow, DataView, IModelPermission } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '@spark-view/spark-component'
import { FIELD_CONTEXT, CONTEXT_DATA } from '../capability-keys'
import { useContainerActions } from './useContainerActions'
import type { ToolbarPosition, LateralActionPosition } from './useContainerActions'
import { useContainerDataSource } from './useContainerDataSource'

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
  config?: ComponentConfig
  /** DataKey 格式：scope@tableName@viewId@field （优先） */
  dataKey?: string
  data?: TreeNode[]
  dataSource?: IDataSource | DataView | undefined
  toolbar?: ComponentConfig[]
  toolbarPosition?: ToolbarPosition
  toolbarClass?: string
  nodeActions?: ComponentConfig[]
  nodeActionsPosition?: NodeActionsPosition
  nodeActionsClass?: string
  onNodeClick?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  onNodeExpand?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  onNodeCollapse?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  [key: string]: unknown
}

const props = defineProps<Props>()

const effectiveDataKey = computed(() =>
  (props.config?.props?.['dataKey'] as string | undefined) ?? props.dataKey
)
const configChildren = computed(() => props.config?.children ?? [])

/** 提取树节点显示文本，避免模板中使用 as any */
function getNodeLabel(data: unknown): string {
  const node = data as TreeNode | undefined
  return node?.label ?? (node?.['name'] as string | undefined) ?? (node?.['title'] as string | undefined) ?? '节点'
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
  actionPositionValue: nodeActionsPositionValue,
  actionClassValue: nodeActionsClassValue,
  visibleToolbarConfigs,
  hasToolbar,
  showActionsLeft: showNodeActionsLeft,
  showActionsRight: showNodeActionsRight,
  getScopedActionConfigs: getScopedNodeActions,
} = useContainerActions<{ data: unknown, node: unknown }>({
  config: computed(() => props.config),
  toolbar: computed(() => props.toolbar),
  toolbarPosition: computed(() => props.toolbarPosition),
  toolbarClass: computed(() => props.toolbarClass),
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