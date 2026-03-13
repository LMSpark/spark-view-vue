<template>
  <div class="project-tree">
    <!-- 工具栏 -->
    <div class="project-tree__toolbar">
      <el-input
        v-model="filterText"
        placeholder="搜索…"
        clearable
        size="small"
        style="flex: 1"
      />
      <el-dropdown size="small" trigger="click">
        <el-button size="small">⋯</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="expandAll">展开全部</el-dropdown-item>
            <el-dropdown-item @click="collapseAll">折叠全部</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 混合树 -->
    <el-tree
      ref="treeRef"
      :data="treeData"
      node-key="_treeId"
      :props="treeProps"
      :default-expand-all="true"
      :filter-node-method="filterNode"
      :expand-on-click-node="false"
      highlight-current
      @node-click="handleNodeClick"
    >
      <template #default="{ data }">
        <span class="tree-node">
          <span class="node-icon">{{ data._icon }}</span>
          <span class="node-label">{{ data._label }}</span>
          <el-tag v-if="data._tag" size="small" :type="data._tagType ?? 'info'" class="node-tag">
            {{ data._tag }}
          </el-tag>
        </span>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ProjectState, Requirement, FunctionModule, PagePlan } from '../composables/types'

export interface TreeNodeData {
  _treeId: string
  _label: string
  _icon: string
  _tag?: string
  _tagType?: 'success' | 'info' | 'warning' | 'danger'
  _kind: 'section' | 'requirement' | 'module' | 'page' | 'nav-group' | 'nav-page'
  _sourceId?: string
  children?: TreeNodeData[]
}

export type ProjectTreeNodeClickEvent = {
  kind: TreeNodeData['_kind']
  sourceId: string | undefined
}

const props = defineProps<{
  state: ProjectState
}>()

const emit = defineEmits<{
  nodeClick: [event: ProjectTreeNodeClickEvent]
}>()

const treeRef = ref()
const filterText = ref('')

const treeProps = {
  label: '_label',
  children: 'children',
}

watch(filterText, (val) => {
  treeRef.value?.filter(val)
})

function filterNode(value: string, data: TreeNodeData) {
  if (!value) return true
  const v = value.toLowerCase()
  return data._label.toLowerCase().includes(v)
}

// ── 构建混合树数据 ──────────────────────────────────────────

function buildRequirementNodes(requirements: Requirement[]): TreeNodeData[] {
  return requirements.map(r => ({
    _treeId: `req-${r.id}`,
    _label: r.title,
    _icon: '📝',
    _tag: r.status,
    _tagType: r.status === 'analyzed' ? 'success' as const : 'info' as const,
    _kind: 'requirement' as const,
    _sourceId: r.id,
  }))
}

function buildModuleNodes(modules: FunctionModule[]): TreeNodeData[] {
  return modules.map(m => ({
    _treeId: `mod-${m.id}`,
    _label: m.name,
    _icon: m.icon || '📦',
    _tag: `${m.pages.length} 页`,
    _tagType: 'info' as const,
    _kind: 'module' as const,
    _sourceId: m.id,
    children: m.pages.map((p: PagePlan) => ({
      _treeId: `page-${p.pageId}`,
      _label: `${p.title} (${p.pageId})`,
      _icon: '📄',
      _tag: p.status,
      _tagType: p.status === 'generated' ? 'success' as const : 'info' as const,
      _kind: 'page' as const,
      _sourceId: p.pageId,
    })),
  }))
}

function buildNavNodes(state: ProjectState): TreeNodeData[] {
  if (!state.navRoot.children?.length) {
    return [{
      _treeId: 'nav-empty',
      _label: '（空导航）',
      _icon: '💤',
      _kind: 'nav-group' as const,
    }]
  }
  return state.navRoot.children.map((node, i) => {
    const result: TreeNodeData = {
      _treeId: `nav-${node.id ?? String(i)}`,
      _label: node.title,
      _icon: node.icon ?? '🔖',
      _kind: 'nav-group' as const,
      _sourceId: node.id,
    }
    if (node.path) result._tag = node.path
    if (node.children) {
      result.children = node.children.map((child, j) => {
        const childNode: TreeNodeData = {
          _treeId: `nav-${child.id ?? `${i}-${j}`}`,
          _label: child.title,
          _icon: child.icon ?? '📄',
          _kind: 'nav-page' as const,
          _sourceId: child.id,
        }
        if (child.path) childNode._tag = child.path
        return childNode
      })
    }
    return result
  })
}

const treeData = computed<TreeNodeData[]>(() => [
  {
    _treeId: 'section-requirements',
    _label: '需求',
    _icon: '📋',
    _kind: 'section' as const,
    _sourceId: 'section-requirements',
    children: buildRequirementNodes(props.state.requirements),
  },
  {
    _treeId: 'section-modules',
    _label: '功能模块',
    _icon: '🏗️',
    _kind: 'section' as const,
    _sourceId: 'section-modules',
    children: buildModuleNodes(props.state.modules),
  },
  {
    _treeId: 'section-navigation',
    _label: '导航结构',
    _icon: '🌐',
    _kind: 'section' as const,
    _sourceId: 'section-navigation',
    children: buildNavNodes(props.state),
  },
])

// ── 操作 ────────────────────────────────────────────────────

function handleNodeClick(data: TreeNodeData) {
  emit('nodeClick', { kind: data._kind, sourceId: data._sourceId })
}

function expandAll() {
  const tree = treeRef.value
  if (!tree) return
  for (const key of ['section-requirements', 'section-modules', 'section-navigation']) {
    const node = tree.getNode(key)
    if (node) node.expanded = true
  }
}

function collapseAll() {
  const tree = treeRef.value
  if (!tree) return
  for (const key of ['section-requirements', 'section-modules', 'section-navigation']) {
    const node = tree.getNode(key)
    if (node) node.expanded = false
  }
}
</script>

<style scoped>
.project-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.project-tree__toolbar {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.project-tree :deep(.el-tree) {
  flex: 1;
  overflow: auto;
  padding: 4px 0;
  --el-tree-node-content-height: 30px;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  overflow: hidden;
}

.node-icon {
  flex-shrink: 0;
  font-size: 14px;
}

.node-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-tag {
  flex-shrink: 0;
  font-size: 10px;
  margin-left: 4px;
}
</style>
