/**
 * WBS 项目状态管理
 *
 * - 树形 WBS 节点 CRUD
 * - localStorage 自动持久化（debounce 1s）
 * - 导出 / 导入
 */
import { reactive, watch, toRaw } from 'vue'
import type {
  ProjectState,
  WbsNode,
  PersistedProject,
} from './types'
import { STORAGE_KEY, STORAGE_VERSION } from './types'

// ── 递归查找工具 ──────────────────────────────────────────────

function findNode(nodes: WbsNode[], id: string): WbsNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findNode(n.children, id)
    if (found) return found
  }
  return null
}

function removeNode(nodes: WbsNode[], id: string): boolean {
  const idx = nodes.findIndex(n => n.id === id)
  if (idx >= 0) {
    nodes.splice(idx, 1)
    return true
  }
  for (const n of nodes) {
    if (removeNode(n.children, id)) return true
  }
  return false
}

// ── 持久化 ────────────────────────────────────────────────────

function loadFromStorage(): Partial<ProjectState> | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as PersistedProject
    if (data.version !== STORAGE_VERSION) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return {
      projectName: data.projectName,
      wbsRoot: data.wbsRoot,
      selectedNodeId: data.selectedNodeId,
      lastUpdated: data.lastUpdated,
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function createDefaultState(): ProjectState {
  return {
    projectName: '新项目',
    wbsRoot: [],
    selectedNodeId: null,
    aiPanelVisible: false,
    lastUpdated: new Date().toISOString(),
  }
}

// ── Composable ────────────────────────────────────────────────

export function useProjectState() {
  const persisted = loadFromStorage()
  const defaults = createDefaultState()
  const state = reactive<ProjectState>({
    ...defaults,
    ...persisted,
    aiPanelVisible: false,
  })

  // ── 持久化（debounce 1s）──────────────────────────────────

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function saveToStorage() {
    const data: PersistedProject = {
      version: STORAGE_VERSION,
      projectName: state.projectName,
      wbsRoot: toRaw(state.wbsRoot),
      selectedNodeId: state.selectedNodeId,
      lastUpdated: new Date().toISOString(),
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      if (import.meta.env.DEV) {
        console.warn('[useProjectState] localStorage quota exceeded')
      }
    }
  }

  function debouncedSave() {
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveToStorage()
      saveTimer = null
    }, 1000)
  }

  watch(
    () => [state.projectName, state.wbsRoot, state.selectedNodeId],
    debouncedSave,
    { deep: true },
  )

  // ── 节点查找 ──────────────────────────────────────────────

  function getNode(id: string): WbsNode | null {
    return findNode(state.wbsRoot, id)
  }

  function getSelectedNode(): WbsNode | null {
    if (!state.selectedNodeId) return null
    return findNode(state.wbsRoot, state.selectedNodeId)
  }

  // ── 选中 ──────────────────────────────────────────────────

  function selectNode(id: string | null) {
    state.selectedNodeId = id
  }

  // ── 节点 CRUD ─────────────────────────────────────────────

  function addNode(parentId: string | null, node: WbsNode) {
    if (!parentId) {
      state.wbsRoot.push(node)
    } else {
      const parent = findNode(state.wbsRoot, parentId)
      if (parent) {
        parent.children.push(node)
      }
    }
    state.selectedNodeId = node.id
  }

  function updateNode(id: string, patch: Partial<WbsNode>) {
    const node = findNode(state.wbsRoot, id)
    if (node) {
      Object.assign(node, patch)
    }
  }

  function deleteNode(id: string) {
    // 如果删除选中节点，清除选中
    if (state.selectedNodeId === id) {
      state.selectedNodeId = null
    }
    // 先尝试顶层
    const topIdx = state.wbsRoot.findIndex(n => n.id === id)
    if (topIdx >= 0) {
      state.wbsRoot.splice(topIdx, 1)
      return
    }
    removeNode(state.wbsRoot, id)
  }

  /** 创建一个分组节点 */
  function createGroup(parentId: string | null, title: string): WbsNode {
    const node: WbsNode = {
      id: crypto.randomUUID(),
      title,
      description: '',
      type: 'group',
      icon: '📁',
      status: 'planned',
      children: [],
    }
    addNode(parentId, node)
    return node
  }

  /** 创建一个页面节点 */
  function createPage(parentId: string | null, title: string, pageId: string): WbsNode {
    const node: WbsNode = {
      id: crypto.randomUUID(),
      title,
      description: '',
      type: 'page',
      icon: '📄',
      status: 'planned',
      pageId,
      pageType: 'list',
      children: [],
    }
    addNode(parentId, node)
    return node
  }

  // ── 导出 / 导入 ──────────────────────────────────────────

  function exportProject(): string {
    const data: PersistedProject = {
      version: STORAGE_VERSION,
      projectName: state.projectName,
      wbsRoot: toRaw(state.wbsRoot),
      selectedNodeId: state.selectedNodeId,
      lastUpdated: new Date().toISOString(),
    }
    return JSON.stringify(data, null, 2)
  }

  function importProject(json: string): boolean {
    try {
      const data = JSON.parse(json) as PersistedProject
      if (data.version !== STORAGE_VERSION) return false
      state.projectName = data.projectName
      state.wbsRoot = data.wbsRoot
      state.selectedNodeId = data.selectedNodeId
      state.lastUpdated = data.lastUpdated
      saveToStorage()
      return true
    } catch {
      return false
    }
  }

  // ── 重置 & 清理 ──────────────────────────────────────────

  function resetProject() {
    const fresh = createDefaultState()
    Object.assign(state, fresh)
    localStorage.removeItem(STORAGE_KEY)
  }

  function dispose() {
    if (saveTimer !== null) clearTimeout(saveTimer)
  }

  return {
    state,
    getNode,
    getSelectedNode,
    selectNode,
    addNode,
    updateNode,
    deleteNode,
    createGroup,
    createPage,
    exportProject,
    importProject,
    resetProject,
    dispose,
  }
}

export type ProjectStateReturn = ReturnType<typeof useProjectState>
export type ProjectAPI = ProjectStateReturn
