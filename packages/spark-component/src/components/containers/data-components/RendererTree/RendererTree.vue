<template>
  <div :class="['renderer-tree-layout', `renderer-tree-layout--${toolbarPositionValue}`]">
    <RendererHostScope v-if="showToolbar" :host="toolbarHost">
      <div :class="['renderer-tree-toolbar', toolbarClassValue]">
        <template v-for="(action, index) in visibleToolbarConfigs" :key="nodeId(action) ?? `r-tree-toolbar-${index}`">
          <SparkComponentRenderer :config="action" />
        </template>
      </div>
    </RendererHostScope>

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
              <RendererActionHost
                v-if="hasNodeActions"
                :actions="getNodeActionConfigs(((slotProps?.data as IDataRow) ?? {}))"
                :row="((slotProps?.data as IDataRow) ?? {})"
                :host="getNodeActionHost(((slotProps?.data as IDataRow) ?? {}), 0)"
                action-key-prefix="r-tree-node-action"
                wrapper-tag="span"
                wrapper-class="tree-node-actions"
              />
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
 * @skill r-tree
 * @description 树形容器，基于 el-tree 绑定 DataView 渲染嵌套树结构，支持懒加载、节点操作和编辑器侧面板。
 * @category container
 * @binding datakey-driven
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @consumes PAGE_DATASET
 * @notes 其他 props 透传到 el-tree（node-key, default-expand-all, show-checkbox 等）
 */
/**
 * RendererTree - 树形容器组件
 *
 * 内部通过 useSparkPageComponent + sparkConsume(PAGE_DATASET) 自行解析 dataKey。
 */
import { computed, ref } from 'vue'
import { useSparkPageComponent, SparkComponentRenderer } from '../../../internal'
import { getSparkNodeChildren, nodeId, type SparkNode } from '../../../internal'
import type { RTreeProps } from './RendererTree.props'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import { usePermission } from '../../../../permission/index.js'
import { PAGE_DATASET, DATA_SOURCE } from '../../../internal'
import { DATA_ROW } from '../../../internal'
import type { RendererTreeApi } from './types'
import RendererActionHost from '../../support/RendererActionHost.vue'
import {
  createRendererTreeZeroCode,
  type TreeNode,
  type ElTreeNode,
  type ElTreeComponent,
} from './zero-code'
import { useRendererTreeInput } from './input'
import { useRendererTreeViewState } from './view-state'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import { useContainerActions } from '../../useContainerActions'
import RendererHostScope from '../../support/RendererHostScope.vue'
import type { SparkComponentHost } from '../../../internal'

import { useContainerDataSource, useContainerDataSourceEffects } from '../../useContainerDataSource'
import { useContainerToolbar } from '../../layout/useContainerToolbar'
import type { ToolbarPosition } from '../../layout/useContainerToolbar'
import RendererDataScope from '../RendererRowFragment/RendererDataScope.vue'

const props = withDefaults(defineProps<RTreeProps>(), {
  type: 'r-tree',
})
const {
  effectiveDataKey,
  effectiveAllowAppend,
  effectiveAllowDelete,
  nodeContentChildren,
  hasLegacyNodeActions,
  hasNodeActions,
  editorConfigs,
  editorPositionValue,
  editorClassValue,
  editorStyleValue,
  showEditor,
} = useRendererTreeInput({ props })

// 接入 SPARK 能力链
const { sparkConsume, sparkProvide, registerApi, logger } = useSparkPageComponent(props)
const pageDataSet = sparkConsume(PAGE_DATASET)
const pageService = sparkConsume(PAGE_SERVICE)
const perm = usePermission()

const { resolvedDataSource: resolvedView, modelPermission } = useContainerDataSource<DataView>({
  externalDataSource: computed(() => props.dataSource),
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
  toolbar: computed(() => getSparkNodeChildren(props.toolbar?.children)),
  toolbarPosition: computed(() => props.toolbar?.props?.position as ToolbarPosition | undefined),
  toolbarClass: computed(() => props.toolbar?.props?.class),
  modelPermission,
  dataSource: computed(() => resolvedView.value),
})

const {
  getScopedActionConfigs: getScopedNodeActions,
} = useContainerActions<{ row: IDataRow, index: number }>({
  actionConfigs: computed(() => getSparkNodeChildren(props.actions?.children)),
  actionPosition: computed(() => 'right'),
  actionClass: computed(() => props.actions?.props?.class),
  modelPermission,
  dataSource: computed(() => resolvedView.value),
  resolveScope: ({ row, index }) => ({
    row,
    listenerArgs: [row, index],
    scopedProps: {
      row,
      rowIndex: index,
      data: row,
    },
  }),
})

function shouldShowLegacyAppend(row: IDataRow): boolean {
  return hasLegacyNodeActions.value
    && effectiveAllowAppend.value
    && perm.isPermitted('create', modelPermission.value ? { modelPermission: modelPermission.value } : {})
    && perm.isPermitted('create-child', { row })
}

function shouldShowLegacyDelete(row: IDataRow): boolean {
  return hasLegacyNodeActions.value
    && effectiveAllowDelete.value
    && perm.isPermitted('delete', { row })
}

sparkProvide(DATA_ROW, {} as IDataRow)

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

const toolbarHost: SparkComponentHost = {
  variant: 'toolbar',
  isDisabled(action) {
    return isBuiltinToolbarActionDisabled(action)
  },
  execute(action) {
    handleBuiltinToolbarAction(action)
  },
}

function getNodeActionHost(row: IDataRow, index: number): SparkComponentHost {
  return {
    variant: 'row-action',
    isDisabled(action) {
      return isBuiltinNodeActionDisabled(action, row, index)
    },
    execute(action) {
      handleBuiltinNodeAction(action, row, index)
    },
  }
}

function getLegacyNodeActionConfigs(row: IDataRow): SparkNode[] {
  const actions: SparkNode[] = []

  if (shouldShowLegacyAppend(row)) {
    actions.push({
      type: 'el-button',
      props: {
        type: 'primary',
        size: 'small',
        link: true,
        on: {
          click: (event?: Event) => {
            event?.stopPropagation?.()
            void handleAppendNode(row)
          },
        },
      },
      children: ['添加'],
    })
  }

  if (shouldShowLegacyDelete(row)) {
    actions.push({
      type: 'el-button',
      props: {
        type: 'danger',
        size: 'small',
        link: true,
        on: {
          click: (event?: Event) => {
            event?.stopPropagation?.()
            void handleDeleteNode(row)
          },
        },
      },
      children: ['删除'],
    })
  }

  return actions
}

function getNodeActionConfigs(row: IDataRow): SparkNode[] {
  return [...getScopedNodeActions({ row, index: 0 }), ...getLegacyNodeActionConfigs(row)]
}

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
