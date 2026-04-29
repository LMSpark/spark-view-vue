<template>
  <div :class="['renderer-tree-layout', `renderer-tree-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-tree-toolbar', toolbarClassValue]">
        <template v-for="(action, index) in visibleToolbarConfigs" :key="nodeId(action) ?? `r-tree-toolbar-${index}`">
          <SparkComponentRenderer :config="action" />
        </template>
    </div>

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
              <template v-if="nodeContentChildren.length > 0">
                <RendererHostScope :row="(slotProps?.data as IDataRow | undefined)">
                  <SparkComponentRenderer
                    v-for="(child, index) in nodeContentChildren"
                    :key="nodeId(child) ?? `r-tree-node-content-${index}`"
                    :config="child"
                  />
                </RendererHostScope>
              </template>
              <template v-else>
                <slot :node="slotProps?.node" :data="slotProps?.data">
                  <span class="node-label">{{ getNodeLabel(slotProps?.data) }}</span>
                </slot>
              </template>
              <span
                v-if="hasNodeActions"
                class="tree-node-actions"
              >
                <SparkComponentRenderer :config="createScopedNodeActionsToolbarConfig((slotProps?.data as IDataRow) ?? {})" />
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
  ACTION_CAPABILITY,
  createActionCapability,
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

import { useContainerDataSource, useContainerDataSourceEffects } from '../../composables/useContainerDataSource'
import { useContainerActionVisibility } from '../../layout/useContainerActionVisibility'
import { useContainerModuleContext } from '../../composables/useContainerModuleContext'
import { resolveCurrentRowPath } from '../../../support/row-selection-path'
import RendererHostScope from '../../support/RendererHostScope.vue'

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

const { resolvedDataSource: resolvedView } = useContainerDataSource<DataView>({
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

const visibleToolbarConfigs = computed(() => toolbarConfigs.value)
const showToolbar = computed(() => visibleToolbarConfigs.value.length > 0)

const { getVisibleActionConfigs: getScopedNodeActions } = useContainerActionVisibility<{ row: IDataRow, index: number }>({
  actionConfigs: dockedNodeActions,
  resolveScope: ({ row, index }) => ({
    row: resolveCurrentRowPath(row, resolvedView.value),
    data: row,
    index,
    listenerArgs: [row, index],
      propsPatch: {
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
  handleBuiltinToolbarAction,
  handleBuiltinNodeAction,
  isBuiltinToolbarActionDisabled,
  isBuiltinNodeActionDisabled,
}: {
  treeApi: RendererTreeApi
  getNodeKey: (data: unknown) => string | number | null
  syncCurrentByKey: (key: string | number | null | undefined) => void
  handleNodeClick: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => Promise<void>
  handleNodeExpand: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => Promise<void>
  handleNodeCollapse: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => Promise<void>
  handleNodeDrop: (draggingNode: ElTreeNode, dropNode: ElTreeNode, dropType: string) => Promise<void>
  handleBuiltinToolbarAction: (action: SparkNode) => void
  handleBuiltinNodeAction: (action: SparkNode, row: IDataRow, index: number) => void
  isBuiltinToolbarActionDisabled: (action: SparkNode) => boolean
  isBuiltinNodeActionDisabled: (action: SparkNode, row: IDataRow, index: number) => boolean
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

const nodeActionCapability = {
  isDisabled(action: SparkNode): boolean {
    const row = action.props?.['row'] as IDataRow | undefined
    const index = action.props?.['rowIndex']
    if (row) return isBuiltinNodeActionDisabled(action, row, typeof index === 'number' ? index : 0)
    return isBuiltinToolbarActionDisabled(action)
  },
  execute(action: SparkNode): void {
    const row = action.props?.['row'] as IDataRow | undefined
    const index = action.props?.['rowIndex']
    if (!row) {
      handleBuiltinToolbarAction(action)
      return
    }
    handleBuiltinNodeAction(action, row, typeof index === 'number' ? index : 0)
  },
}

sparkProvide(ACTION_CAPABILITY, createActionCapability(nodeActionCapability))

function createScopedNodeActionsToolbarConfig(row: IDataRow): SparkNode {
  return {
    type: 'r-toolbar',
    children: getScopedNodeActions({ row, index: 0 }),
  }
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

