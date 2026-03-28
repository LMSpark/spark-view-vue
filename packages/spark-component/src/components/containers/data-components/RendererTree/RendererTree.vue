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
      <template v-for="(action, index) in visibleToolbarConfigs" :key="nodeId(action) ?? `r-tree-toolbar-${index}`">
        <el-button
          v-if="isBuiltinAction(action)"
          :type="getBuiltinButtonType(action)"
          :size="getBuiltinButtonSize(action)"
          :plain="getBuiltinButtonPlain(action)"
          :text="getBuiltinButtonText(action)"
          :link="getBuiltinButtonLink(action)"
          :disabled="isBuiltinToolbarActionDisabled(action)"
          :class="getBuiltinButtonClass(action)"
          @click="handleBuiltinToolbarAction(action)"
        >{{ getBuiltinActionLabel(action) }}</el-button>
        <SparkComponentRenderer
          v-else
          :config="action"
        />
      </template>
    </div>

    <div :class="['renderer-tree-body', `renderer-tree-body--editor-${editorPositionValue}`]">
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

      <div v-if="showEditor" :class="['renderer-tree-editor', editorClassValue]" :style="editorStyleValue">
        <template v-for="(child, index) in editorConfigs" :key="nodeId(child) ?? `r-tree-editor-${index}`">
          <SparkComponentRenderer :config="child" />
        </template>
      </div>
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
import { useSparkComponent, SparkComponentRenderer } from '../../../internal'
import { nodeId, type SparkNode } from '../../../internal'
import type { ContainerDocks } from '../../../../core/types'
import { type IDataRow, type DataView } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '../../../internal'
import { CONTEXT_DATA, FIELD_CONTEXT } from '../../../internal'
import type { RendererTreeApi } from './types'
import {
  createRendererTreeZeroCode,
  type TreeNode,
  type ElTreeNode,
  type ElTreeComponent,
  type TreeEventHandler,
  type TreeNodeActionHandler,
} from './zero-code'
import { useRendererTreeInput } from './input'
import { useRendererTreeViewState } from './view-state'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import { useContainerActions } from '../../actions/useContainerActions'
import {
  isBuiltinAction,
  getBuiltinActionLabel,
  getBuiltinButtonType,
  getBuiltinButtonSize,
  getBuiltinButtonPlain,
  getBuiltinButtonText,
  getBuiltinButtonLink,
  getBuiltinButtonClass,
} from '../../builtin-actions'
import { useContainerDataSource, useContainerDataSourceEffects } from '../../data/useContainerDataSource'
import { useContainerToolbar } from '../../layout/useContainerToolbar'
import type { ToolbarPosition } from '../../layout/useContainerToolbar'
import RendererDataScope from '../RendererDataScope.vue'
import {
  type AddRowHandler,
  type EditRowHandler,
  type RemoveRowHandler,
} from '../../support/index.js'

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
  onAddRow?: AddRowHandler
  onEditRow?: EditRowHandler
  onRemoveRow?: RemoveRowHandler
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-tree',
})
const {
  effectiveDataKey,
  effectiveAllowAppend,
  effectiveAllowDelete,
  nodeContentChildren,
  dockedToolbar,
  dockedNodeActions,
  hasLegacyNodeActions,
  hasNodeActions,
  editorConfigs,
  editorPositionValue,
  editorClassValue,
  editorStyleValue,
  showEditor,
} = useRendererTreeInput({ props })

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

const {
  treeApi,
  getNodeKey,
  syncCurrentByKey,
  handleNodeClick,
  handleNodeExpand,
  handleNodeCollapse,
  handleNodeDrop,
  handleAppendNode,
  handleDeleteNode,
  isBuiltinNodeActionDisabled,
  isBuiltinToolbarActionDisabled,
  handleBuiltinToolbarAction,
  handleBuiltinNodeAction,
}: {
  treeApi: RendererTreeApi
  getNodeKey: (data: unknown) => string | number | null
  syncCurrentByKey: (key: string | number | null | undefined) => void
  handleNodeClick: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => Promise<void>
  handleNodeExpand: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => Promise<void>
  handleNodeCollapse: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => Promise<void>
  handleNodeDrop: (draggingNode: ElTreeNode, dropNode: ElTreeNode, dropType: string) => Promise<void>
  handleAppendNode: (data: unknown) => Promise<void>
  handleDeleteNode: (data: unknown) => Promise<void>
  isBuiltinNodeActionDisabled: (action: SparkNode, row: IDataRow, index: number) => boolean
  isBuiltinToolbarActionDisabled: (action: SparkNode) => boolean
  handleBuiltinToolbarAction: (action: SparkNode) => void
  handleBuiltinNodeAction: (action: SparkNode, row: IDataRow, index: number) => void
} = createRendererTreeZeroCode({
  props,
  resolvedView,
  treeData: computed(() => treeData.value as IDataRow[]),
  nativeTreeRef,
  logger,
  pageService,
  nodeKeyField,
  treeIdField,
  effectiveAllowAppend,
  effectiveAllowDelete,
})

const {
  treeData,
  elTreeFieldProps,
  getNodeLabel,
} = useRendererTreeViewState({
  props,
  resolvedView,
  nodeKeyField,
  treeIdField,
  nativeTreeRef,
  syncCurrentByKey,
  expandToNode: treeApi.expandToNode,
  getNodeKey,
})

registerApi(treeApi)

defineExpose(treeApi)

// 事件处理器与零代码动作由 createRendererTreeZeroCode 收口
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

.renderer-tree-body {
  display: flex;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.renderer-tree-body--editor-left {
  flex-direction: row-reverse;
}

.renderer-tree-body--editor-top {
  flex-direction: column-reverse;
}

.renderer-tree-body--editor-bottom {
  flex-direction: column;
}

.renderer-tree-editor {
  min-width: 280px;
  width: min(420px, 42%);
  flex-shrink: 0;
}

.renderer-tree-body--editor-top .renderer-tree-editor,
.renderer-tree-body--editor-bottom .renderer-tree-editor {
  width: 100%;
  min-width: 0;
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
