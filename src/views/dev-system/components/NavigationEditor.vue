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

    <!-- 有选中节点 → 编辑面板 -->
    <template v-if="selected">
      <div class="node-editor-card">
        <el-form label-position="top" class="editor-form">
          <el-form-item label="标题">
            <el-input v-model="selected.title" @input="markDirty" />
          </el-form-item>
          <el-form-item label="路由路径">
            <el-input v-model="editPath" @input="onPathInput" placeholder="如：/orders" />
          </el-form-item>
          <el-form-item label="页面 ID">
            <el-input v-model="editPageId" @input="onPageIdInput" placeholder="如：order-list" />
          </el-form-item>
          <el-form-item label="图标">
            <el-input v-model="editIcon" @input="onIconInput" placeholder="如：📦" style="width: 160px" />
          </el-form-item>
          <el-form-item label="节点类型">
            <el-select v-model="editType" @change="onTypeChange" style="width: 200px">
              <el-option value="item" label="菜单项（item）" />
              <el-option value="group" label="分组（group）" />
            </el-select>
          </el-form-item>
        </el-form>

        <el-divider />

        <div class="node-actions">
          <el-button size="small" @click="addChildToSelected">+ 添加子节点</el-button>
          <el-popconfirm title="确认删除此节点及子节点？" @confirm="removeSelected">
            <template #reference>
              <el-button size="small" type="danger">删除节点</el-button>
            </template>
          </el-popconfirm>
        </div>
      </div>
    </template>

    <!-- 无选中节点 → 简要概览 -->
    <template v-else>
      <div class="nav-overview">
        <div v-if="project.state.navRoot.children.length" class="nav-summary">
          <p class="summary-text">
            共 <strong>{{ totalNodeCount }}</strong> 个导航节点，
            <strong>{{ project.state.navRoot.children.length }}</strong> 个顶级分组
          </p>
          <p class="hint-text">从左侧树选择导航节点进行编辑</p>
        </div>
        <div v-else class="nav-empty">
          <p>暂无导航节点</p>
          <p class="hint-sub">点击上方「+ 添加分组」创建第一个导航分组</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { NavNode } from '@spark-view/spark-app'
import { ElMessage } from 'element-plus'
import { useProject } from '../composables/useProjectInject'

const props = defineProps<{
  nodeId?: string
}>()

const project = useProject()

// ── 选中节点 ────────────────────────────────────────────────

const selected = ref<NavNode | null>(null)
const editPath = ref('')
const editPageId = ref('')
const editIcon = ref('')
const editType = ref<'item' | 'group'>('item')

watch(
  () => props.nodeId,
  (id) => {
    if (id) {
      const node = findNodeById(project.state.navRoot.children, id)
      if (node) {
        selected.value = node
        editPath.value = node.path ?? ''
        editPageId.value = node.pageId ?? ''
        editIcon.value = node.icon ?? ''
        editType.value = node.type === 'group' ? 'group' : 'item'
        return
      }
    }
    selected.value = null
  },
  { immediate: true },
)

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

// ── 编辑 ────────────────────────────────────────────────────

function markDirty() {
  project.state.navDirty = true
}

function onPathInput() {
  if (selected.value) {
    selected.value.path = editPath.value
    markDirty()
  }
}

function onPageIdInput() {
  if (selected.value) {
    selected.value.pageId = editPageId.value
    markDirty()
  }
}

function onIconInput() {
  if (selected.value) {
    selected.value.icon = editIcon.value
    markDirty()
  }
}

function onTypeChange() {
  if (selected.value) {
    selected.value.type = editType.value
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
  // 自动聚焦到新节点
  project.setFocus({ view: 'navigation', nodeId: node.id })
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
  // 聚焦到新子节点
  project.setFocus({ view: 'navigation', nodeId: child.id })
}

function removeSelected() {
  if (!selected.value) return
  const targetId = selected.value.id
  removeFromTree(project.state.navRoot.children, targetId)
  markDirty()
  project.setFocus({ view: 'navigation' })
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

// ── 统计 ────────────────────────────────────────────────────

function countNodes(nodes: NavNode[]): number {
  let count = nodes.length
  for (const n of nodes) {
    if (n.children) count += countNodes(n.children)
  }
  return count
}

const totalNodeCount = computed(() => countNodes(project.state.navRoot.children))

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

.node-editor-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 20px;
  max-width: 560px;
}

.editor-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.node-actions {
  display: flex;
  gap: 8px;
}

.nav-overview {
  flex: 1;
}

.summary-text {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin: 0 0 8px;
}

.hint-text {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.nav-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.hint-sub {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
