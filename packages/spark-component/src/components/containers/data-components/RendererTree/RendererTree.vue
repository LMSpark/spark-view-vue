<template>
  <div :class="['renderer-tree-layout', `renderer-tree-layout--${toolbarPositionValue}`]">
    <RendererHostScope v-if="showToolbar" type="r-tree-toolbar-scope" :row="resolvedDataRow ?? undefined">
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
          v-bind="treePropsValue"
          @node-click="handleNodeClick"
          @node-expand="handleNodeExpand"
          @node-collapse="handleNodeCollapse"
          @node-drop="handleNodeDrop"
        >
          <template #default="slotProps">
            <span class="custom-tree-node">
              <RendererHostScope
                v-if="nodeContentChildren.length > 0"
                type="r-data-scope"
                :children="nodeContentChildren"
                :row="(slotProps?.data as IDataRow) ?? {}"
              />
              <RendererHostScope
                v-else
                type="r-data-scope"
                :row="(slotProps?.data as IDataRow) ?? {}"
              >
                <slot :node="slotProps?.node" :data="slotProps?.data">
                  <span class="node-label">{{ getNodeLabel(slotProps?.data) }}</span>
                </slot>
              </RendererHostScope>
              <span
                v-if="hasNodeActions"
                class="tree-node-actions"
              >
                <RendererHostScope
                  :children="getNodeActionConfigs(((slotProps?.data as IDataRow) ?? {}))"
                  type="r-tree-node-action-scope"
                  :row="((slotProps?.data as IDataRow) ?? {})"
                />
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
 * @skill r-tree
 * @description 树形容器，支持懒加载、节点操作和编辑器侧面板。
 * @category container
 * @binding datakey-driven
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @consumes PAGE_DATASET
 * @notes 树形原生属性需通过 props.treeProps 显式声明（如 defaultExpandAll、showCheckbox）
 */
/**
 * RendererTree - 树形容器组件
 *
 * 内部通过 useSparkPageComponent + sparkConsume(PAGE_DATASET) 自行解析 dataKey。
 */
import { computed, ref } from 'vue'
import {
  useSparkPageComponent,
  SparkComponentRenderer,
  nodeId,
  PAGE_DATASET,
  DATA_SOURCE,
  MODULE_CONTEXT,
  PAGE_SERVICE,
  type SparkNode,
} from '../../../internal'
import type { RTreeProps } from './RendererTree.props'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import type { RendererTreeApi } from './types'
import {
  createRendererTreeZeroCode,
  type TreeNode,
  type ElTreeNode,
  type ElTreeComponent,
} from './zero-code'
import { useRendererTreeInput } from './input'
import { useRendererTreeViewState } from './view-state'
import { useContainerActions } from '../../composables/useContainerActions'
import RendererHostScope from '../../support/RendererHostScope.vue'

import { useContainerDataSource, useContainerDataSourceEffects } from '../../composables/useContainerDataSource'
import { useContainerToolbar } from '../../layout/useContainerToolbar'
import { useContainerModuleContext } from '../../composables/useContainerModuleContext'

const props = withDefaults(defineProps<RTreeProps>(), {
  type: 'r-tree',
})
const treePropsValue = computed<Record<string, unknown>>(() => ({ ...(props.treeProps ?? {}) }))
const {
  effectiveDataKey,
  nodeContentChildren,
  toolbarConfigs,
  toolbarPositionValue,
  toolbarClassValue,
  dockedNodeActions,
  nodeActionClassValue,
  permissionDeniedBehaviorValue,
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
const moduleContext = useContainerModuleContext(sparkConsume(MODULE_CONTEXT))

const { resolvedDataSource: resolvedView, resolvedDataRow, modelPermission } = useContainerDataSource<DataView>({
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
  visibleToolbarConfigs, showToolbar,
} = useContainerToolbar({
  toolbar: toolbarConfigs,
  toolbarPosition: toolbarPositionValue,
  toolbarClass: toolbarClassValue,
  modelPermission,
  dataSource: computed(() => resolvedView.value),
})

const {
  getScopedActionConfigs: getScopedNodeActions,
} = useContainerActions<{ row: IDataRow, index: number }>({
  actionConfigs: dockedNodeActions,
  actionPosition: computed(() => 'right'),
  actionClass: nodeActionClassValue,
  permissionDeniedBehavior: permissionDeniedBehaviorValue,
  modelPermission,
  dataSource: computed(() => resolvedView.value),
  resolveScope: ({ row, index }) => ({
    row,
    listenerArgs: [row, index],
    scopedProps: {
      row,
      rowIndex: index,
      data: row,
      moduleContext: moduleContext.value,
    },
  }),
})

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
}: {
  treeApi: RendererTreeApi
  getNodeKey: (data: unknown) => string | number | null
  syncCurrentByKey: (key: string | number | null | undefined) => void
  handleNodeClick: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => Promise<void>
  handleNodeExpand: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => Promise<void>
  handleNodeCollapse: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => Promise<void>
  handleNodeDrop: (draggingNode: ElTreeNode, dropNode: ElTreeNode, dropType: string) => Promise<void>
} = createRendererTreeZeroCode({
  props,
  resolvedView,
  treeData: computed(() => treeData.value as IDataRow[]),
  nativeTreeRef,
  logger,
  pageService,
  nodeKeyField,
  treeIdField,
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

function getNodeActionConfigs(row: IDataRow): SparkNode[] {
  return getScopedNodeActions({ row, index: 0 })
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

