<template>
  <div class="navigation-editor">
    <div class="editor-header">
      <h2 class="editor-title">🌐 导航设计</h2>
      <div class="editor-actions">
        <el-button size="small" @click="addGroup">+ 添加分组</el-button>
        <el-button size="small" type="success" :disabled="!project.state.navDirty" @click="handleSave">
          💾 保存到后端
        </el-button>
      </div>
    </div>

    <div class="nav-editor-body">
      <!-- 左侧：导航树 -->
      <div class="nav-tree-panel">
        <el-tree
          ref="treeRef"
          :data="navTree"
          node-key="_id"
          default-expand-all
          highlight-current
          draggable
          :allow-drop="allowDrop"
          @node-click="selectNode"
          @node-drop="handleDrop"
        >
          <template #default="{ data }">
            <span class="nav-tree-node">
              <span>{{ data.icon ?? '📄' }} {{ data.title }}</span>
              <span v-if="data.path" class="nav-path-badge">{{ data.path }}</span>
            </span>
          </template>
        </el-tree>
        <div v-if="!navTree.length" class="nav-empty-hint">
          暂无导航节点，点击右上角「+ 添加分组」开始
        </div>
      </div>

      <!-- 右侧：选中节点编辑 -->
      <div class="nav-detail-panel">
        <template v-if="selected">
          <h3>编辑节点</h3>
          <el-form label-position="top" class="editor-form">
            <el-form-item label="标题">
              <el-input v-model="selected.title" @input="markDirty" />
            </el-form-item>
            <el-form-item label="路由路径">
              <el-input v-model="selectedPath" @input="onPathInput" placeholder="如：/orders" />
            </el-form-item>
            <el-form-item label="页面 ID">
              <el-input v-model="selectedPageId" @input="onPageIdInput" placeholder="如：order-list" />
            </el-form-item>
            <el-form-item label="图标">
              <el-input v-model="selectedIcon" @input="onIconInput" style="width: 120px" />
            </el-form-item>
            <el-form-item label="节点类型">
              <el-select v-model="selectedType" @change="onTypeChange" style="width: 100%">
                <el-option value="item" label="菜单项（item）" />
                <el-option value="group" label="分组（group）" />
              </el-select>
            </el-form-item>
            <el-divider />
            <div class="node-actions">
              <el-button size="small" @click="addChildToSelected">+ 添加子节点</el-button>
              <el-popconfirm title="确认删除此节点及子节点？" @confirm="removeSelected">
                <template #reference>
                  <el-button size="small" type="danger">删除节点</el-button>
                </template>
              </el-popconfirm>
            </div>
          </el-form>
        </template>
        <div v-else class="select-hint">
          <p>👈 在左侧选择一个节点进行编辑</p>
          <p class="hint-sub">支持拖拽排序</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { NavNode } from '@spark-view/spark-app'
import { ElMessage } from 'element-plus'
import { useProject } from '../composables/useProjectInject'

const project = useProject()
const treeRef = ref()

// ── 导航树数据（el-tree 需要稳定 node-key）──────────────────

/** 给每个节点补上 _id 用于 el-tree node-key */
interface NavTreeNode extends NavNode {
  _id: string
  children?: NavTreeNode[]
}

let idCounter = 0

function assignIds(nodes: NavNode[]): NavTreeNode[] {
  return nodes.map(n => {
    const { children, ...rest } = n
    const node: NavTreeNode = { ...rest, _id: n.id ?? `nav-tmp-${++idCounter}` }
    if (children?.length) {
      node.children = assignIds(children)
    }
    return node
  })
}

const navTree = computed<NavTreeNode[]>(() => assignIds(project.state.navRoot.children))

// ── 选中节点编辑 ────────────────────────────────────────────

const selected = ref<NavNode | null>(null)
const selectedPath = ref('')
const selectedPageId = ref('')
const selectedIcon = ref('')
const selectedType = ref<'item' | 'group'>('item')

function selectNode(data: NavTreeNode) {
  // 找到真实引用（直接修改 reactive 状态）
  const real = findNodeById(project.state.navRoot.children, data._id)
  if (real) {
    selected.value = real
    selectedPath.value = real.path ?? ''
    selectedPageId.value = real.pageId ?? ''
    selectedIcon.value = real.icon ?? ''
    selectedType.value = real.type === 'group' ? 'group' : 'item'
  }
}

function findNodeById(nodes: NavNode[], id: string): NavNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const found = findNodeById(n.children, id)
      if (found) return found
    }
  }
  return null
}

function markDirty() {
  project.state.navDirty = true
}

function onPathInput() {
  if (selected.value) {
    selected.value.path = selectedPath.value
    markDirty()
  }
}

function onPageIdInput() {
  if (selected.value) {
    selected.value.pageId = selectedPageId.value
    markDirty()
  }
}

function onIconInput() {
  if (selected.value) {
    selected.value.icon = selectedIcon.value
    markDirty()
  }
}

function onTypeChange() {
  if (selected.value) {
    selected.value.type = selectedType.value
    markDirty()
  }
}

// ── 节点操作 ────────────────────────────────────────────────

function addGroup() {
  const node: NavNode = {
    id: crypto.randomUUID(),
    title: '新分组',
    type: 'group',
    icon: '📁',
    children: [],
  }
  project.state.navRoot.children.push(node)
  markDirty()
}

function addChildToSelected() {
  if (!selected.value) return
  if (!selected.value.children) {
    selected.value.children = []
  }
  const child: NavNode = {
    id: crypto.randomUUID(),
    title: '新页面',
    type: 'item',
    icon: '📄',
    path: '',
    pageId: '',
  }
  selected.value.children.push(child)
  markDirty()
}

function removeSelected() {
  if (!selected.value) return
  const targetId = selected.value.id
  removeFromTree(project.state.navRoot.children, targetId)
  selected.value = null
  markDirty()
}

function removeFromTree(nodes: NavNode[], id: string): boolean {
  const idx = nodes.findIndex(n => n.id === id)
  if (idx >= 0) {
    nodes.splice(idx, 1)
    return true
  }
  for (const n of nodes) {
    if (n.children && removeFromTree(n.children, id)) return true
  }
  return false
}

// ── 拖拽 ────────────────────────────────────────────────────

function allowDrop(_dragging: unknown, _drop: unknown, type: string) {
  return type !== 'none'
}

function handleDrop() {
  // el-tree drag 已经修改了树结构，只需同步回 navRoot
  syncTreeToNavRoot()
  markDirty()
}

function syncTreeToNavRoot() {
  // el-tree 的 data 是 computed 从 navRoot 派生的，
  // 拖拽后 el-tree 内部改的是 navTree 的临时副本，
  // 需要从 el-tree 重新提取结构写回 navRoot
  const root = treeRef.value
  if (!root) return
  const treeStore = root.store
  if (!treeStore) return
  const rootNodes = treeStore.root.childNodes
  project.state.navRoot.children = extractNavNodes(rootNodes)
}

function extractNavNodes(elNodes: Array<{ data: NavTreeNode; childNodes: unknown[] }>): NavNode[] {
  return elNodes.map((n) => {
    const { _id: _, children: __, ...rest } = n.data
    const node: NavNode = { ...rest }
    if (n.childNodes?.length) {
      node.children = extractNavNodes(n.childNodes as Array<{ data: NavTreeNode; childNodes: unknown[] }>)
    }
    return node
  })
}

// ── 保存 ────────────────────────────────────────────────────

async function handleSave() {
  const ok = await project.saveNavToBackend()
  if (ok) {
    ElMessage.success('导航已保存到后端')
  } else {
    ElMessage.error('保存失败，请检查后端连接')
  }
}
</script>

<style scoped>
.navigation-editor {
  padding: 20px 24px;
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.editor-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.editor-actions {
  display: flex;
  gap: 8px;
}

.nav-editor-body {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
  overflow: hidden;
}

.nav-tree-panel {
  flex: 1;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 8px;
  overflow: auto;
}

.nav-detail-panel {
  width: 320px;
  flex-shrink: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 16px;
  overflow: auto;
}

.nav-detail-panel h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}

.editor-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.nav-tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.nav-path-badge {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  background: var(--el-fill-color-lighter);
  padding: 1px 6px;
  border-radius: 3px;
}

.nav-empty-hint {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.select-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.hint-sub {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.node-actions {
  display: flex;
  gap: 8px;
}
</style>
