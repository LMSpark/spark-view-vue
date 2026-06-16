<!--
@module app:views/app/dev-system/DevSiteTree
职责：提供 DevSystem 的 DevSiteTree 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/DevSiteTree。
-->
<template>
  <div class="dev-tree">
    <div class="dev-tree__toolbar">
      <el-input
        v-model="treeFilter"
        placeholder="搜索节点…"
        clearable
        size="small"
        style="flex: 1"
      />
      <el-button size="small" type="primary" @click="state.addRootNode()" title="新增模块">
        <NavIcon name="Plus" :size="14" />
      </el-button>
      <el-dropdown size="small" trigger="click">
        <el-button size="small">
          <NavIcon name="MoreFilled" :size="14" />
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="expandAll">展开全部</el-dropdown-item>
            <el-dropdown-item @click="collapseAll">折叠全部</el-dropdown-item>
            <el-dropdown-item divided @click="state.openRequirementImportDialog()">
              <NavIcon name="Upload" :size="14" /> 导入需求文档
            </el-dropdown-item>
            <el-dropdown-item
              :disabled="state.hasReservedRootGroup('toolbar')"
              @click="state.restoreReservedRootGroup('toolbar')"
            >
              恢复工具栏组
            </el-dropdown-item>
            <el-dropdown-item
              :disabled="state.hasReservedRootGroup('user-menu')"
              @click="state.restoreReservedRootGroup('user-menu')"
            >
              恢复用户菜单组
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <el-empty v-if="state.navEmpty.value" description="后端导航数据为空" />
    <el-tree
      v-else
      ref="treeRef"
      :data="state.treeData.value"
      node-key="id"
      :props="{ label: 'title', children: 'children' }"
      :default-expand-all="true"
      :filter-node-method="filterNode"
      highlight-current
      draggable
      :allow-drag="allowNodeDrag"
      :allow-drop="allowNodeDrop"
      :expand-on-click-node="false"
      @node-click="handleNodeClick"
      @node-drop="handleNodeDrop"
    >
      <template #default="{ node, data }">
        <span class="tree-node">
          <span class="node-icon"><NavIcon :name="data.icon ?? 'Document'" /></span>
          <span class="node-label">{{ data.title }}</span>
          <el-tag size="small" type="success" class="node-tag node-kind-tag">
            {{ formatNodeKind(data) }}
          </el-tag>
          <span v-if="data.path" class="node-path">{{ data.path }}</span>
          <el-tag v-if="data.childPlacement" size="small" type="info" class="node-tag">
            {{ formatChildPlacementLabel(data.childPlacement) }}
          </el-tag>
          <el-tag v-if="data.context" size="small" type="warning" class="node-tag">
            context
          </el-tag>
          <span class="node-actions">
            <el-button size="small" link type="primary" @click.stop="state.addChildNode(data)">
              <NavIcon name="Plus" :size="12" />
            </el-button>
            <el-button
              size="small"
              link
              type="danger"
              :disabled="state.isSystemRootDirectory(data)"
              @click.stop="handleRemove(node, data)"
            >
              <NavIcon name="Delete" :size="12" />
            </el-button>
          </span>
        </span>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { ProjectNodeData } from '@spark-appworks/spark-project-model'
import { isNestedConfigPageNode } from '@spark-appworks/spark-project-model'
import type { DevState } from './useDevState'
import { formatChildPlacementLabel } from './childPlacementLabels'
import NavIcon from '@/components/NavIcon.vue'

const props = defineProps<{ state: DevState }>()
const state = props.state

const treeRef = ref()
const treeFilter = ref('')

const NODE_KIND_LABEL: Record<string, string> = {
  'system-directory': '系统模块',
  'module': '模块',
  'system-page': '系统页面',
  'system-action': '系统动作',
  'page': '普通页面',
  'link': '超链接',
  'nested-page': '子页面',
}

function inferNodeKind(node: ProjectNodeData): string {
  if (node.nodeKind) return node.nodeKind
  if (node.childPlacement === 'toolbar' || node.childPlacement === 'user-menu') return 'system-directory'
  if (node.linkTarget === 'iframe' || node.linkTarget === 'new-tab') return 'link'
  return 'page'
}

function formatNodeKind(node: ProjectNodeData): string {
  if (isNestedConfigPageNode(node)) return NODE_KIND_LABEL['nested-page'] ?? '子页面'
  const kind = inferNodeKind(node)
  return NODE_KIND_LABEL[kind] ?? kind
}

watch(treeFilter, (val) => { treeRef.value?.filter(val) })

// 同步 el-tree 高亮到 selectedNode
watch(() => state.selectedNode.value, async (node) => {
  if (node) {
    await nextTick()
    treeRef.value?.setCurrentKey(node.id)
  }
}, { immediate: true })

function filterNode(value: string, data: ProjectNodeData) {
  if (!value) return true
  const v = value.toLowerCase()
  return data.title.toLowerCase().includes(v) ||
    data.id.toLowerCase().includes(v) ||
    (data.path?.toLowerCase().includes(v) ?? false)
}

async function handleNodeClick(data: ProjectNodeData) {
  await state.selectNode(data)
}

function allowNodeDrag(data: ProjectNodeData): boolean {
  return !state.isSystemRootDirectory(data)
}

function allowNodeDrop(draggingNode: { data: ProjectNodeData }): boolean {
  return !state.isSystemRootDirectory(draggingNode.data)
}

function handleNodeDrop(draggingNode: { data: ProjectNodeData }) {
  void state.moveNodeInTree(draggingNode.data)
}

async function handleRemove(node: { parent: { data: ProjectNodeData } }, data: ProjectNodeData) {
  try {
    await ElMessageBox.confirm(
      `确定删除 "${data.title}"？${data.children?.length ? `（含 ${data.children.length} 个子节点）` : ''}`,
      '确认删除',
      { type: 'warning' },
    )
  } catch { return }
  state.removeNodeFromTree(node, data)
}

function expandAll() {
  for (const k of getAllKeys(state.treeData.value)) treeRef.value?.getNode(k)?.expand()
}
function collapseAll() {
  for (const k of getAllKeys(state.treeData.value)) treeRef.value?.getNode(k)?.collapse()
}
function getAllKeys(nodes: ProjectNodeData[]): string[] {
  return nodes.flatMap(n => [n.id, ...(n.children ? getAllKeys(n.children) : [])])
}

defineExpose({ treeRef })
</script>

<style scoped>
.dev-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.dev-tree__toolbar {
  display: flex;
  gap: 6px;
  padding: 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
  background: var(--el-fill-color-extra-light);
}

.dev-tree :deep(.el-tree) {
  flex: 1;
  overflow: auto;
  background: transparent;
  padding: 8px;
}

.dev-tree :deep(.el-tree-node__content) {
  border-radius: 8px;
  margin-bottom: 2px;
}

.dev-tree :deep(.el-tree-node__content:hover) {
  background: var(--el-fill-color-light);
}

.tree-node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  font-size: 13px;
  overflow: hidden;
}
.node-icon {
  display: inline-flex;
  align-items: center;
  color: var(--el-color-primary);
}
.node-label { flex-shrink: 0; font-weight: 500; }
.node-path {
  color: var(--el-text-color-placeholder);
  font-size: 11px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-tag { flex-shrink: 0; }
.node-actions {
  margin-left: auto;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity .15s;
}

:deep(.node-actions .el-button) {
  margin: 0;
  min-width: 20px;
}

:deep(.el-tree-node__content:hover) .node-actions { opacity: 1; }
</style>
