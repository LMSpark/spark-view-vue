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
      <el-button size="small" type="primary" @click="state.addRootNode()" title="新增模块">➕</el-button>
      <el-dropdown size="small" trigger="click">
        <el-button size="small">⋯</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="expandAll">展开全部</el-dropdown-item>
            <el-dropdown-item @click="collapseAll">折叠全部</el-dropdown-item>
            <el-dropdown-item divided @click="handleReset">🔄 重置演示</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <el-empty v-if="state.navEmpty.value" description="后端导航数据为空">
      <el-button type="primary" @click="state.initSeedNavigation()">🚀 初始化种子导航数据</el-button>
    </el-empty>
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
      :expand-on-click-node="false"
      @node-click="handleNodeClick"
      @node-drop="handleNodeDrop"
    >
      <template #default="{ node, data }">
        <span class="tree-node">
          <span class="node-icon">{{ data.icon ?? '📄' }}</span>
          <span class="node-label">{{ data.title }}</span>
          <span v-if="data.path" class="node-path">{{ data.path }}</span>
          <el-tag v-if="data.childPlacement" size="small" type="info" class="node-tag">
            {{ data.childPlacement }}
          </el-tag>
          <el-tag v-if="data.context" size="small" type="warning" class="node-tag">
            context
          </el-tag>
          <span class="node-actions">
            <el-button size="small" link type="primary" @click.stop="state.addChildNode(data)">➕</el-button>
            <el-button size="small" link type="danger" @click.stop="handleRemove(node, data)">🗑️</el-button>
          </span>
        </span>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { NavNode } from '@spark-view/spark-app'
import type { DevState } from './useDevState'

const props = defineProps<{ state: DevState }>()
const state = props.state

const treeRef = ref()
const treeFilter = ref('')

watch(treeFilter, (val) => { treeRef.value?.filter(val) })

function filterNode(value: string, data: NavNode) {
  if (!value) return true
  const v = value.toLowerCase()
  return data.title.toLowerCase().includes(v) ||
    data.id.toLowerCase().includes(v) ||
    (data.path?.toLowerCase().includes(v) ?? false)
}

function handleNodeClick(data: NavNode) {
  state.selectNode(data)
}

function handleNodeDrop() {
  state.markNavDirty()
}

async function handleRemove(node: { parent: { data: NavNode } }, data: NavNode) {
  try {
    await ElMessageBox.confirm(
      `确定删除 "${data.title}"？${data.children?.length ? `（含 ${data.children.length} 个子节点）` : ''}`,
      '确认删除',
      { type: 'warning' },
    )
  } catch { return }
  state.removeNodeFromTree(node, data)
}

async function handleReset() {
  try {
    await ElMessageBox.confirm('确定重置为演示导航？当前修改将丢失。', '确认', { type: 'warning' })
  } catch { return }
  state.resetToDemo()
}

function expandAll() {
  for (const k of getAllKeys(state.treeData.value)) treeRef.value?.getNode(k)?.expand()
}
function collapseAll() {
  for (const k of getAllKeys(state.treeData.value)) treeRef.value?.getNode(k)?.collapse()
}
function getAllKeys(nodes: NavNode[]): string[] {
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
  padding: 8px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.dev-tree :deep(.el-tree) {
  flex: 1;
  overflow: auto;
  background: transparent;
  padding: 4px;
}

.tree-node {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  font-size: 13px;
  overflow: hidden;
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
:deep(.el-tree-node__content:hover) .node-actions { opacity: 1; }
</style>
