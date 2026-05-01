<template>
  <div :class="['renderer-tree-layout', `renderer-tree-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-tree-toolbar', toolbarClassValue]">
        <SparkComponentRenderer
          v-for="(action, index) in visibleToolbarConfigs"
          :key="nodeId(action) ?? `r-tree-toolbar-${index}`"
          :config="action"
        />
    </div>

    <div :class="['renderer-tree-body', `renderer-tree-body--editor-${editorPositionValue}`]">
      <el-tree
        ref="nativeTreeRef"
        class="renderer-tree-main"
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
            <RendererHostScope :row="(slotProps?.data as IDataRow | undefined)">
              <template v-if="nodeContentChildren.length > 0">
                <SparkComponentRenderer
                  v-for="(child, index) in nodeContentChildren"
                  :key="nodeId(child) ?? `r-tree-node-content-${index}`"
                  :config="child"
                />
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
                <SparkComponentRenderer :config="rawNodeActionsToolbarConfig" />
              </span>
            </RendererHostScope>
          </span>
        </template>
      </el-tree>

      <div v-if="showEditor" :class="['renderer-tree-editor', editorClassValue]" :style="editorStyleValue">
        <SparkComponentRenderer
          v-for="(child, index) in editorConfigs"
          :key="nodeId(child) ?? `r-tree-editor-${index}`"
          :config="child"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-tree
 * @description 树形容器，支持懒加载、节点操作和编辑器侧面板。
 * @category container
 * @binding dataKey-driven
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @consumes PAGE_DATASET
 * @notes 树形原生属性需通过 props.treeProps 显式声明（如 defaultExpandAll、showCheckbox）
 */
/**
 * RendererTree - 树形容器组件
 *
 * 内部通过 useContainerDataSource 统一解析 dataKey，并走能力链读取 PAGE_DATASET。
 */
import { computed, nextTick, ref, toRef, watch } from 'vue'
import {
  useSparkPageComponent,
  SparkComponentRenderer,
  nodeId,
  DATA_SOURCE,
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
  type NativeTreeLike,
  type NativeTreeNodeLike,
} from './zero-code'
import { useRendererTreeInput } from './input'
import { useRendererTreeViewState } from '../view-state'

import { useContainerDataSource } from '../../composables/container-composables'
import RendererHostScope from '../../support/RendererHostScope.vue'
import { mergeNodeBeforeRenderProps, resolveNodeBeforeRender } from '../../../support/beforeRender'

const props = withDefaults(defineProps<RTreeProps>(), {
  type: 'r-tree',
})
const treePropsValue = computed<Record<string, unknown>>(() => ({ ...(props.treeProps ?? {}) }))
const {
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
const pageService = sparkConsume(PAGE_SERVICE)

const { resolvedDataSource: resolvedView, modelPermission } = useContainerDataSource<DataView>({
  externalDataSource: toRef(props, 'dataSource'),
  dataKey: toRef(props, 'dataKey'),
  sparkConsume,
  mapView: view => view,
  provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
  logger,
  logPrefix: 'RendererTree',
})

const nodeKeyField = computed(() =>
  props.nodeKey ?? primaryKey.value ?? treeConfig.value?.idField ?? 'id'
)

const treeIdField = computed(() =>
  treeConfig.value?.idField ?? 'id'
)

function resolveTreeToolbarActionNode(node: SparkNode): SparkNode {
  const dataSource = resolvedView.value
  const scopedRowInput = currentRow.value
  const scopedRow = scopedRowInput !== null && scopedRowInput !== undefined && typeof scopedRowInput === 'object' && !Array.isArray(scopedRowInput)
    ? scopedRowInput as IDataRow
    : undefined

  const beforeRender = resolveNodeBeforeRender(node, {
    row: scopedRow,
    data: scopedRow,
    dataSource,
    modelPermission: modelPermission.value,
    host: { type: 'r-tree-toolbar' },
  })

  // 仅做 onBeforeRender 透传；权限/禁用由叶子组件（RendererButton）自管。
  return mergeNodeBeforeRenderProps(node, beforeRender.propsPatch, {
    markResolved: true,
  })
}

function isTreeToolbarActionVisible(node: SparkNode): boolean {
  return node.props?.['visible'] !== false
}

const visibleToolbarConfigs = computed(() => toolbarConfigs.value.map(resolveTreeToolbarActionNode).filter(isTreeToolbarActionVisible))
const showToolbar = computed(() => visibleToolbarConfigs.value.length > 0)

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
  currentRow,
  primaryKey,
  treeConfig,
} = useRendererTreeViewState({
  resolvedView,
  treeIdField,
})

watch(
  currentRow,
  async nextCurrentRow => {
    await nextTick()
    const tree = nativeTreeRef.value as NativeTreeLike | null
    if (!tree?.setCurrentKey) return
    const key = getNodeKey(nextCurrentRow)
    tree.setCurrentKey(key ?? null)
  },
  { immediate: true }
)

watch(
  [() => treeData.value, () => props.expandLevel],
  async ([nextTreeRows, expandLevel]) => {
    if (nextTreeRows.length === 0 || expandLevel === undefined) return
    await applyExpandLevel(treeData.value, nativeTreeRef, getNodeKey, expandLevel)
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
    if (rowCount === 0 || expandToKey === null || expandToKey === undefined) return
    await treeApi.expandToNode(expandToKey)
  },
  { immediate: true }
)

async function applyExpandLevel(
  nextTreeData: TreeNode[],
  treeRef: { value: unknown },
  resolveNodeKey: (data: unknown) => string | number | null,
  level: number,
): Promise<void> {
  if (!Number.isFinite(level) || level < 2) return
  await nextTick()
  const tree = treeRef.value as NativeTreeLike | null
  for (const key of collectExpandKeysByLevel(nextTreeData, resolveNodeKey, level)) {
    const nativeNode = tree?.getNode?.(key) as NativeTreeNodeLike | undefined
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

registerApi(treeApi)

const rawNodeActionsToolbarConfig = computed<SparkNode>(() => ({
  type: 'r-toolbar',
  children: dockedNodeActions.value,
}))

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
