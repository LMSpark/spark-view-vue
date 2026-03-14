<template>
  <div class="nav-module-manager">
    <el-page-header content="导航与模块管理" @back="$router.go(-1)">
      <template #icon><span style="font-size: 20px">🧭</span></template>
    </el-page-header>

    <div class="manager-body">
      <!-- 左侧：导航树 -->
      <el-card class="tree-panel" shadow="never" v-loading="loading">
        <template #header>
          <div class="panel-header">
            <span>导航结构</span>
            <div class="panel-actions">
              <el-button size="small" type="primary" @click="addRootNode">➕ 新增模块</el-button>
              <el-button size="small" @click="expandAll">展开全部</el-button>
              <el-button size="small" @click="collapseAll">折叠全部</el-button>
            </div>
          </div>
        </template>
        <el-empty v-if="navEmpty" description="后端导航数据为空">
          <el-button type="primary" @click="initSeedNavigation">🚀 初始化种子导航数据</el-button>
        </el-empty>
        <el-tree
          v-else
          ref="treeRef"
          :data="treeData"
          node-key="id"
          :props="{ label: 'title', children: 'children' }"
          :expand-on-click-node="false"
          :default-expand-all="true"
          highlight-current
          draggable
          @node-click="handleNodeClick"
          @node-drop="handleNodeDrop"
        >
          <template #default="{ node, data }">
            <span class="tree-node">
              <span class="node-icon">{{ data.icon ?? '📄' }}</span>
              <span class="node-title">{{ data.title }}</span>
              <span v-if="data.path" class="node-path">{{ data.path }}</span>
              <el-tag v-if="data.childPlacement" size="small" type="info" class="node-tag">
                {{ data.childPlacement }}
              </el-tag>
              <el-tag v-if="data.context" size="small" type="warning" class="node-tag">
                context
              </el-tag>
              <span class="node-actions">
                <el-button size="small" link type="primary" @click.stop="addChildNode(data)">
                  ➕
                </el-button>
                <el-button size="small" link type="danger" @click.stop="removeNode(node, data)">
                  🗑️
                </el-button>
              </span>
            </span>
          </template>
        </el-tree>
      </el-card>

      <!-- 右侧：节点编辑 -->
      <el-card class="edit-panel" shadow="never">
        <template #header>
          <div class="panel-header">
            <span>{{ selectedNode ? `编辑节点 · ${selectedNode.title}` : '请选择节点' }}</span>
            <el-button v-if="dirty" size="small" type="success" @click="applyChanges">
              ✅ 应用更改
            </el-button>
          </div>
        </template>

        <template v-if="selectedNode">
          <el-form :model="editForm" label-width="100px" size="default">
            <!-- 基础信息 -->
            <el-divider content-position="left">基础信息</el-divider>
            <el-form-item label="ID">
              <el-input v-model="editForm.id" placeholder="唯一标识，如 user-list" @change="markDirty" />
            </el-form-item>
            <el-form-item label="标题">
              <el-input v-model="editForm.title" placeholder="显示名称" @change="markDirty" />
            </el-form-item>
            <el-form-item label="图标">
              <el-input v-model="editForm.icon" placeholder="📄" style="width: 80px" @change="markDirty" />
            </el-form-item>
            <el-form-item label="类型">
              <el-select v-model="editForm.type" placeholder="默认 item" clearable @change="markDirty">
                <el-option value="item" label="item（普通节点）" />
                <el-option value="group" label="group（分组标题）" />
                <el-option value="divider" label="divider（分隔线）" />
              </el-select>
            </el-form-item>

            <!-- 路由配置 -->
            <el-divider content-position="left">路由配置</el-divider>
            <el-form-item label="路由路径">
              <el-input v-model="editForm.path" placeholder="/xxx（叶子节点填写）" @change="markDirty" />
            </el-form-item>
            <el-form-item label="Page ID">
              <el-input v-model="editForm.pageId" placeholder="配置页面 ID（可选）" @change="markDirty" />
            </el-form-item>
            <el-form-item label="重定向">
              <el-input v-model="editForm.redirect" placeholder="组节点默认跳转路径" @change="markDirty" />
            </el-form-item>
            <el-form-item label="外部链接">
              <el-input v-model="editForm.externalUrl" placeholder="https://..." @change="markDirty" />
            </el-form-item>

            <!-- 布局配置 -->
            <el-divider content-position="left">布局配置</el-divider>
            <el-form-item label="子项布局">
              <el-radio-group v-model="editForm.childPlacement" @change="markDirty">
                <el-radio-button value="">默认</el-radio-button>
                <el-radio-button value="header">header</el-radio-button>
                <el-radio-button value="sidebar">sidebar</el-radio-button>
                <el-radio-button value="parent">parent</el-radio-button>
                <el-radio-button value="flat">flat</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="排序号">
              <el-input-number v-model="editForm.order" :min="0" :max="999" @change="markDirty" />
            </el-form-item>

            <!-- 状态控制 -->
            <el-divider content-position="left">状态控制</el-divider>
            <el-form-item label="隐藏">
              <el-switch v-model="editForm.hidden" @change="markDirty" />
            </el-form-item>
            <el-form-item label="禁用">
              <el-switch v-model="editForm.disabled" @change="markDirty" />
            </el-form-item>
            <el-form-item label="标签固定">
              <el-switch v-model="editForm.affix" @change="markDirty" />
            </el-form-item>
            <el-form-item label="徽标">
              <el-input v-model="editForm.badge" placeholder="数字或文字" style="width: 120px" @change="markDirty" />
            </el-form-item>

            <!-- 模块上下文 -->
            <el-divider content-position="left">模块上下文（Context）</el-divider>
            <el-form-item label="启用上下文">
              <el-switch v-model="hasContext" @change="toggleContext" />
            </el-form-item>
            <template v-if="hasContext">
              <el-form-item label="选项列表">
                <div class="context-items">
                  <div v-for="(item, idx) in contextItems" :key="idx" class="context-item-row">
                    <el-input v-model="item.id" placeholder="ID" style="width: 120px" @change="markDirty" />
                    <el-input v-model="item.title" placeholder="显示名称" style="flex: 1" @change="markDirty" />
                    <el-button size="small" link type="danger" @click="removeContextItem(idx)">✕</el-button>
                  </div>
                  <el-button size="small" type="primary" link @click="addContextItem">
                    ➕ 新增选项
                  </el-button>
                </div>
              </el-form-item>
              <el-form-item label="占位文字">
                <el-input v-model="contextConfig.placeholder" placeholder="请选择" @change="markDirty" />
              </el-form-item>
              <el-form-item label="默认值">
                <el-input v-model="contextConfig.defaultValue" placeholder="默认选中的 ID" @change="markDirty" />
              </el-form-item>
              <el-form-item label="URL 参数名">
                <el-input v-model="contextConfig.paramName" placeholder="同步到 route.query 的键名" @change="markDirty" />
              </el-form-item>
            </template>
          </el-form>
        </template>

        <el-empty v-else description="点击左侧树节点进行编辑" />
      </el-card>
    </div>

    <!-- 底部操作栏 -->
    <div class="footer-bar">
      <el-button @click="resetToDemo">🔄 重置为演示数据</el-button>
      <div class="footer-right">
        <el-button @click="showPreview = true">👁️ 预览 JSON</el-button>
        <el-button type="primary" @click="saveNavConfig">💾 保存配置</el-button>
      </div>
    </div>

    <!-- JSON 预览对话框 -->
    <el-dialog v-model="showPreview" title="导航配置 JSON" width="720px" top="5vh">
      <el-input
        :model-value="previewJson"
        type="textarea"
        :rows="30"
        readonly
        style="font-family: monospace; font-size: 13px"
      />
      <template #footer>
        <el-button @click="copyJson">📋 复制</el-button>
        <el-button @click="showPreview = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { NavNode, NavRoot, NavContextItem } from '@spark-view/spark-app'

// ── 树数据 ──
const treeRef = ref()
const treeData = ref<NavNode[]>([])

// ── 选中节点 ──
const selectedNode = ref<NavNode | null>(null)
const dirty = ref(false)

// ── 编辑表单 ──
const editForm = reactive({
  id: '',
  title: '',
  icon: '',
  type: '' as string,
  path: '',
  pageId: '',
  redirect: '',
  externalUrl: '',
  childPlacement: '' as string,
  order: 0,
  hidden: false,
  disabled: false,
  affix: false,
  badge: '',
})

// ── 模块上下文编辑 ──
const hasContext = ref(false)
const contextItems = ref<Array<{ id: string; title: string }>>([])
const contextConfig = reactive({
  placeholder: '',
  defaultValue: '',
  paramName: '',
})

// ── JSON 预览 ──
const showPreview = ref(false)
const previewJson = computed(() => {
  const root: NavRoot = {
    childPlacement: 'header',
    children: treeData.value,
  }
  return JSON.stringify(root, null, 2)
})

import { getNavApi } from '@/services/api-paths'
import { http } from '@/services/http'

// ── API ──
const loading = ref(false)

const navEmpty = ref(false)

async function loadFromServer() {
  loading.value = true
  try {
    const config = await http.get<{ childPlacement?: string; children?: NavNode[] }>(getNavApi())
    if (config.children && config.children.length > 0) {
      treeData.value = config.children
      navEmpty.value = false
    } else {
      treeData.value = []
      navEmpty.value = true
    }
  } catch {
    treeData.value = []
    navEmpty.value = true
  } finally {
    loading.value = false
  }
}

/** 将种子导航数据写入后端并重新加载 */
async function initSeedNavigation() {
  try {
    const { demoNavRoot } = await import('@/layout/demo-nav')
    await http.put(getNavApi(), demoNavRoot)
    await loadFromServer()
    ElMessage.success('种子导航数据已初始化')
  } catch (e) {
    ElMessage.error('初始化失败: ' + String(e))
  }
}

// ── 初始化 ──
onMounted(() => {
  void loadFromServer()
})

// ── 树操作 ──
function handleNodeClick(data: NavNode) {
  if (dirty.value) {
    applyChanges()
  }
  selectedNode.value = data
  loadNodeToForm(data)
}

function loadNodeToForm(node: NavNode) {
  editForm.id = node.id
  editForm.title = node.title
  editForm.icon = node.icon ?? ''
  editForm.type = node.type ?? ''
  editForm.path = node.path ?? ''
  editForm.pageId = node.pageId ?? ''
  editForm.redirect = node.redirect ?? ''
  editForm.externalUrl = node.externalUrl ?? ''
  editForm.childPlacement = node.childPlacement ?? ''
  editForm.order = node.order ?? 0
  editForm.hidden = node.hidden ?? false
  editForm.disabled = node.disabled ?? false
  editForm.affix = node.affix ?? false
  editForm.badge = node.badge != null ? String(node.badge) : ''

  // 加载上下文
  if (node.context) {
    hasContext.value = true
    if (Array.isArray(node.context)) {
      contextItems.value = node.context.map(i => ({ id: String(i.id), title: i.title }))
      contextConfig.placeholder = ''
      contextConfig.defaultValue = ''
      contextConfig.paramName = ''
    } else if (typeof node.context === 'object') {
      const cfg = node.context as { source?: unknown; placeholder?: string; defaultValue?: unknown; paramName?: string }
      const src = cfg.source
      contextItems.value = Array.isArray(src)
        ? (src as NavContextItem[]).map(i => ({ id: String(i.id), title: i.title }))
        : []
      contextConfig.placeholder = cfg.placeholder ?? ''
      contextConfig.defaultValue = cfg.defaultValue != null ? String(cfg.defaultValue) : ''
      contextConfig.paramName = cfg.paramName ?? ''
    }
  } else {
    hasContext.value = false
    contextItems.value = []
    contextConfig.placeholder = ''
    contextConfig.defaultValue = ''
    contextConfig.paramName = ''
  }

  dirty.value = false
}

function markDirty() {
  dirty.value = true
}

function applyChanges() {
  if (!selectedNode.value) return
  const node = selectedNode.value

  // 用类型安全的方式构建 partial，避免 exactOptionalPropertyTypes 报错
  const patch: Record<string, unknown> = {
    id: editForm.id,
    title: editForm.title,
  }
  if (editForm.icon) patch['icon'] = editForm.icon
  if (editForm.type) patch['type'] = editForm.type
  if (editForm.path) patch['path'] = editForm.path
  if (editForm.pageId) patch['pageId'] = editForm.pageId
  if (editForm.redirect) patch['redirect'] = editForm.redirect
  if (editForm.externalUrl) patch['externalUrl'] = editForm.externalUrl
  if (editForm.childPlacement) patch['childPlacement'] = editForm.childPlacement
  if (editForm.order) patch['order'] = editForm.order
  if (editForm.hidden) patch['hidden'] = editForm.hidden
  if (editForm.disabled) patch['disabled'] = editForm.disabled
  if (editForm.affix) patch['affix'] = editForm.affix
  if (editForm.badge) patch['badge'] = editForm.badge

  // 写回上下文
  if (hasContext.value && contextItems.value.length > 0) {
    const items = contextItems.value.filter(i => i.id && i.title)
    if (contextConfig.placeholder || contextConfig.defaultValue || contextConfig.paramName) {
      const ctx: Record<string, unknown> = { source: items }
      if (contextConfig.placeholder) ctx['placeholder'] = contextConfig.placeholder
      if (contextConfig.defaultValue) ctx['defaultValue'] = contextConfig.defaultValue
      if (contextConfig.paramName) ctx['paramName'] = contextConfig.paramName
      patch['context'] = ctx
    } else {
      patch['context'] = items
    }
  }

  // 清理旧的可选字段（用 patch 覆盖保留 children 引用）
  const keys: (keyof NavNode)[] = ['icon', 'type', 'path', 'pageId', 'redirect', 'externalUrl', 'childPlacement', 'order', 'hidden', 'disabled', 'affix', 'badge', 'context']
  for (const k of keys) {
    if (!(k in patch)) {
      delete (node as Record<string, unknown>)[k]
    }
  }
  Object.assign(node, patch)

  dirty.value = false
  ElMessage.success('已应用到内存')
}

// ── 增删节点 ──
function addRootNode() {
  const id = `module-${Date.now()}`
  treeData.value.push({
    id,
    title: '新模块',
    icon: '📁',
    childPlacement: 'sidebar',
    children: [],
  })
  ElMessage.success('已添加根模块')
}

function addChildNode(parent: NavNode) {
  if (!parent.children) {
    parent.children = []
  }
  const id = `page-${Date.now()}`
  parent.children.push({
    id,
    title: '新页面',
    icon: '📄',
    path: `/${id}`,
  })
  ElMessage.success('已添加子节点')
}

async function removeNode(node: { parent: { data: NavNode } }, data: NavNode) {
  try {
    await ElMessageBox.confirm(
      `确定删除节点 "${data.title}"？${data.children?.length ? `\n将同时删除 ${data.children.length} 个子节点。` : ''}`,
      '确认删除',
      { type: 'warning' }
    )
  } catch {
    return
  }

  const parent = node.parent
  if (parent?.data?.children) {
    const idx = parent.data.children.indexOf(data)
    if (idx >= 0) {
      parent.data.children.splice(idx, 1)
    }
  } else {
    // 根节点
    const idx = treeData.value.indexOf(data)
    if (idx >= 0) {
      treeData.value.splice(idx, 1)
    }
  }

  if (selectedNode.value === data) {
    selectedNode.value = null
  }
  ElMessage.success('已删除')
}

function handleNodeDrop() {
  ElMessage.info('节点已移动')
}

// ── 上下文编辑 ──
function toggleContext(val: boolean) {
  if (val && contextItems.value.length === 0) {
    contextItems.value.push({ id: '', title: '' })
  }
  markDirty()
}

function addContextItem() {
  contextItems.value.push({ id: '', title: '' })
  markDirty()
}

function removeContextItem(idx: number) {
  contextItems.value.splice(idx, 1)
  markDirty()
}

// ── 树展开/折叠 ──
function expandAll() {
  const tree = treeRef.value
  if (!tree) return
  for (const key of getAllNodeKeys(treeData.value)) {
    tree.getNode(key)?.expand()
  }
}

function collapseAll() {
  const tree = treeRef.value
  if (!tree) return
  for (const key of getAllNodeKeys(treeData.value)) {
    tree.getNode(key)?.collapse()
  }
}

function getAllNodeKeys(nodes: NavNode[]): string[] {
  const keys: string[] = []
  for (const n of nodes) {
    keys.push(n.id)
    if (n.children) {
      keys.push(...getAllNodeKeys(n.children))
    }
  }
  return keys
}

// ── 保存/重置 ──
async function saveNavConfig() {
  if (dirty.value) {
    applyChanges()
  }
  const root: NavRoot = { childPlacement: 'header', children: treeData.value }
  try {
    await http.put(getNavApi(), root)
    ElMessage.success('导航配置已保存到服务端')
  } catch (e) {
    ElMessage.error('保存失败: ' + String(e))
  }
}

async function resetToDemo() {
  try {
    await ElMessageBox.confirm('确定重置为演示导航数据？当前修改将丢失。', '确认重置', { type: 'warning' })
  } catch {
    return
  }
  await initSeedNavigation()
  selectedNode.value = null
  dirty.value = false
}

function copyJson() {
  void navigator.clipboard.writeText(previewJson.value).then(() => {
    ElMessage.success('已复制到剪贴板')
  })
}


</script>

<style scoped>
.nav-module-manager {
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.manager-body {
  flex: 1;
  display: flex;
  gap: 16px;
  margin-top: 16px;
  min-height: 0;
  overflow: hidden;
}

.tree-panel {
  width: 420px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}
.tree-panel :deep(.el-card__body) {
  flex: 1;
  overflow: auto;
}

.edit-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.edit-panel :deep(.el-card__body) {
  flex: 1;
  overflow: auto;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.panel-actions {
  display: flex;
  gap: 4px;
}

.tree-node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  font-size: 13px;
}

.node-icon {
  font-size: 14px;
}

.node-title {
  font-weight: 500;
}

.node-path {
  color: #909399;
  font-size: 12px;
  font-family: monospace;
}

.node-tag {
  margin-left: 4px;
}

.node-actions {
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.15s;
}
.tree-node:hover .node-actions {
  opacity: 1;
}

.context-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.context-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0 0;
  border-top: 1px solid var(--el-border-color-lighter);
  margin-top: 16px;
}

.footer-right {
  display: flex;
  gap: 8px;
}
</style>
