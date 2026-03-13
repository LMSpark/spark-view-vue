<template>
  <div class="site-manager">
    <!-- ═══ 顶栏 ═══ -->
    <div class="top-bar">
      <el-page-header content="站点管理" @back="$router.go(-1)">
        <template #icon><span style="font-size: 20px">🏗️</span></template>
      </el-page-header>
      <div class="top-actions">
        <el-button size="small" @click="showCreateDialog">➕ 新建页面</el-button>
        <el-button size="small" @click="showPreview = true">👁️ 预览 JSON</el-button>
        <el-tag v-if="navDirty" type="warning" size="small">未保存</el-tag>
        <el-button type="primary" size="small" :loading="navSaving" @click="saveAll">💾 保存</el-button>
      </div>
    </div>

    <div class="main-body" v-loading="navLoading">
      <!-- ═══ 左侧：导航树 ═══ -->
      <div class="tree-panel">
        <div class="panel-toolbar">
          <el-input v-model="treeFilter" placeholder="搜索节点…" clearable size="small" style="flex:1" />
          <el-button size="small" type="primary" @click="addRootNode" title="新增模块">➕</el-button>
          <el-dropdown size="small" trigger="click">
            <el-button size="small">⋯</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="expandAll">展开全部</el-dropdown-item>
                <el-dropdown-item @click="collapseAll">折叠全部</el-dropdown-item>
                <el-dropdown-item divided @click="resetToDemo">🔄 重置为演示数据</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <el-tree
          ref="treeRef"
          :data="treeData"
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
              <el-tag v-if="data.pageId" size="small" type="success" class="node-tag"
                      :title="`配置路径: ${String(data.pageId)}`">📁</el-tag>
              <el-tag v-if="data.childPlacement" size="small" type="info" class="node-tag">
                {{ data.childPlacement }}
              </el-tag>
              <span class="node-actions">
                <el-button size="small" link type="primary" @click.stop="addChildNode(data)">➕</el-button>
                <el-button size="small" link type="danger" @click.stop="removeNode(node, data)">🗑️</el-button>
              </span>
            </span>
          </template>
        </el-tree>
      </div>

      <!-- ═══ 右侧：属性编辑 + 页面配置文件编辑 (Tabs) ═══ -->
      <div class="right-panel">
        <template v-if="selectedNode">
          <el-tabs v-model="rightTab" type="border-card" class="right-tabs" @tab-change="handleTabChange">
            <!-- ── Tab: 节点属性 ── -->
            <el-tab-pane label="🔧 节点属性" name="props">
              <div class="props-scroll">
                <el-form :model="editForm" label-width="100px" size="default">
                  <el-divider content-position="left">基础信息</el-divider>
                  <el-form-item label="ID">
                    <el-input v-model="editForm.id" placeholder="唯一标识" @change="markNavDirty" />
                  </el-form-item>
                  <el-form-item label="标题">
                    <el-input v-model="editForm.title" placeholder="显示名称" @change="markNavDirty" />
                  </el-form-item>
                  <el-form-item label="图标">
                    <el-input v-model="editForm.icon" placeholder="📄" style="width: 80px" @change="markNavDirty" />
                  </el-form-item>
                  <el-form-item label="类型">
                    <el-select v-model="editForm.type" placeholder="默认 item" clearable @change="markNavDirty">
                      <el-option value="item" label="item（普通节点）" />
                      <el-option value="group" label="group（分组标题）" />
                      <el-option value="divider" label="divider（分隔线）" />
                    </el-select>
                  </el-form-item>

                  <el-divider content-position="left">路由 & 关联页面</el-divider>
                  <el-form-item label="路由路径">
                    <el-input v-model="editForm.path" placeholder="/xxx" @change="markNavDirty" />
                  </el-form-item>
                  <el-form-item label="配置路径">
                    <el-input
                      v-model="editForm.pageId"
                      placeholder="文件夹名称，如 order-list"
                      clearable
                      @change="handlePageIdChange"
                    />
                  </el-form-item>
                  <el-form-item label="重定向">
                    <el-input v-model="editForm.redirect" placeholder="组节点默认跳转" @change="markNavDirty" />
                  </el-form-item>
                  <el-form-item label="外部链接">
                    <el-input v-model="editForm.externalUrl" placeholder="https://..." @change="markNavDirty" />
                  </el-form-item>

                  <el-divider content-position="left">布局</el-divider>
                  <el-form-item label="子项布局">
                    <el-radio-group v-model="editForm.childPlacement" @change="markNavDirty">
                      <el-radio-button value="">默认</el-radio-button>
                      <el-radio-button value="header">header</el-radio-button>
                      <el-radio-button value="sidebar">sidebar</el-radio-button>
                      <el-radio-button value="parent">parent</el-radio-button>
                      <el-radio-button value="flat">flat</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item label="排序号">
                    <el-input-number v-model="editForm.order" :min="0" :max="999" @change="markNavDirty" />
                  </el-form-item>

                  <el-divider content-position="left">状态</el-divider>
                  <el-form-item label="隐藏">
                    <el-switch v-model="editForm.hidden" @change="markNavDirty" />
                  </el-form-item>
                  <el-form-item label="禁用">
                    <el-switch v-model="editForm.disabled" @change="markNavDirty" />
                  </el-form-item>
                  <el-form-item label="标签固定">
                    <el-switch v-model="editForm.affix" @change="markNavDirty" />
                  </el-form-item>
                  <el-form-item label="徽标">
                    <el-input v-model="editForm.badge" style="width:120px" @change="markNavDirty" />
                  </el-form-item>

                  <el-divider content-position="left">模块上下文</el-divider>
                  <el-form-item label="启用上下文">
                    <el-switch v-model="hasContext" @change="toggleContext" />
                  </el-form-item>
                  <template v-if="hasContext">
                    <el-form-item label="选项列表">
                      <div class="context-items">
                        <div v-for="(item, idx) in contextItems" :key="idx" class="context-item-row">
                          <el-input v-model="item.id" placeholder="ID" style="width:100px" @change="markNavDirty" />
                          <el-input v-model="item.title" placeholder="名称" style="flex:1" @change="markNavDirty" />
                          <el-button size="small" link type="danger" @click="removeContextItem(idx)">✕</el-button>
                        </div>
                        <el-button size="small" type="primary" link @click="addContextItem">➕ 新增</el-button>
                      </div>
                    </el-form-item>
                    <el-form-item label="占位文字">
                      <el-input v-model="contextConfig.placeholder" @change="markNavDirty" />
                    </el-form-item>
                    <el-form-item label="默认值">
                      <el-input v-model="contextConfig.defaultValue" @change="markNavDirty" />
                    </el-form-item>
                    <el-form-item label="URL 参数名">
                      <el-input v-model="contextConfig.paramName" @change="markNavDirty" />
                    </el-form-item>
                  </template>
                </el-form>
              </div>
            </el-tab-pane>

            <!-- ── Tab: 页面配置文件（仅 pageId 存在时显示） ── -->
            <el-tab-pane v-if="editForm.pageId" name="rule.json" :lazy="true">
              <template #label>
                <span :class="{ 'file-dirty': fileDirty['rule.json'] }">📐 rule.json</span>
              </template>
              <el-input
                v-model="editFiles['rule.json']"
                type="textarea"
                :autosize="{ minRows: 28, maxRows: 50 }"
                style="font-family:monospace;font-size:13px"
                @input="fileDirty['rule.json'] = true"
              />
            </el-tab-pane>
            <el-tab-pane v-if="editForm.pageId" name="pagedata.json" :lazy="true">
              <template #label>
                <span :class="{ 'file-dirty': fileDirty['pagedata.json'] }">📊 pagedata.json</span>
              </template>
              <el-input
                v-model="editFiles['pagedata.json']"
                type="textarea"
                :autosize="{ minRows: 28, maxRows: 50 }"
                style="font-family:monospace;font-size:13px"
                @input="fileDirty['pagedata.json'] = true"
              />
            </el-tab-pane>
            <el-tab-pane v-if="editForm.pageId" name="script.js" :lazy="true">
              <template #label>
                <span :class="{ 'file-dirty': fileDirty['script.js'] }">⚡ script.js</span>
              </template>
              <el-input
                v-model="editFiles['script.js']"
                type="textarea"
                :autosize="{ minRows: 28, maxRows: 50 }"
                style="font-family:monospace;font-size:13px"
                @input="fileDirty['script.js'] = true"
              />
            </el-tab-pane>
            <el-tab-pane v-if="editForm.pageId" name="style.css" :lazy="true">
              <template #label>
                <span :class="{ 'file-dirty': fileDirty['style.css'] }">🎨 style.css</span>
              </template>
              <el-input
                v-model="editFiles['style.css']"
                type="textarea"
                :autosize="{ minRows: 28, maxRows: 50 }"
                style="font-family:monospace;font-size:13px"
                @input="fileDirty['style.css'] = true"
              />
            </el-tab-pane>
          </el-tabs>

          <!-- 右侧底部操作栏 -->
          <div class="right-footer">
            <div class="right-footer-left">
              <el-button
                v-if="editForm.path"
                size="small"
                type="success"
                @click="previewPage"
              >
                🔍 预览页面
              </el-button>
              <el-button
                v-if="editForm.path"
                size="small"
                type="warning"
                @click="openAiDebug"
              >
                🐛 AI 调试
              </el-button>
            </div>
            <div class="right-footer-right">
              <el-button v-if="navDirty" size="small" @click="applyNavChanges">✅ 应用节点更改</el-button>
              <el-button
                v-if="hasAnyFileDirty"
                size="small"
                type="primary"
                :loading="fileSaving"
                @click="savePageFiles"
              >
                💾 保存配置文件
              </el-button>
            </div>
          </div>
        </template>

        <el-empty v-else description="👈 选择左侧导航节点开始编辑" />
      </div>
    </div>

    <!-- ═══ 新建页面对话框 ═══ -->
    <el-dialog v-model="createVisible" title="新建配置页面" width="480px" :close-on-click-modal="false">
      <el-form :model="createForm" label-width="100px" :rules="createRules" ref="createFormRef">
        <el-form-item label="Page ID" prop="pageId">
          <el-input v-model="createForm.pageId" placeholder="英文/数字/横线，如 order-list" />
        </el-form-item>
        <el-form-item label="页面标题" prop="title">
          <el-input v-model="createForm.title" placeholder="订单列表" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="createForm.icon" placeholder="📄" style="width: 80px" />
        </el-form-item>
        <el-divider />
        <el-form-item label="关联导航节点">
          <el-switch v-model="createForm.linkToNav" />
          <span v-if="selectedNode" style="margin-left:8px;color:#909399;font-size:12px">
            → 挂到「{{ selectedNode.title }}」下
          </span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="doCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- ═══ JSON 预览 ═══ -->
    <el-dialog v-model="showPreview" title="导航配置 JSON" width="720px" top="5vh">
      <el-input :model-value="previewJson" type="textarea" :rows="30" readonly
                style="font-family:monospace;font-size:13px" />
      <template #footer>
        <el-button @click="copyJson">📋 复制</el-button>
        <el-button @click="showPreview = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import type { NavNode, NavRoot, NavContextItem } from '@spark-view/spark-app'
import { demoNavRoot } from '@/layout/demo-nav'

const router = useRouter()

// ════════════════════════════════════════════════
// 导航树
// ════════════════════════════════════════════════
const treeRef = ref()
const treeData = ref<NavNode[]>([])
const navLoading = ref(false)
const navSaving = ref(false)
const selectedNode = ref<NavNode | null>(null)
const navDirty = ref(false)
const showPreview = ref(false)
const treeFilter = ref('')

watch(treeFilter, (val) => { treeRef.value?.filter(val) })

function filterNode(value: string, data: NavNode) {
  if (!value) return true
  const v = value.toLowerCase()
  return data.title.toLowerCase().includes(v) ||
    data.id.toLowerCase().includes(v) ||
    (data.path?.toLowerCase().includes(v) ?? false) ||
    (data.pageId?.toLowerCase().includes(v) ?? false)
}

// 节点属性编辑表单
const editForm = reactive({
  id: '', title: '', icon: '', type: '' as string,
  path: '', pageId: '', redirect: '', externalUrl: '',
  childPlacement: '' as string, order: 0,
  hidden: false, disabled: false, affix: false, badge: '',
})

const hasContext = ref(false)
const contextItems = ref<Array<{ id: string; title: string }>>([])
const contextConfig = reactive({ placeholder: '', defaultValue: '', paramName: '' })

// 右侧 Tab
const rightTab = ref('props')

const previewJson = computed(() =>
  JSON.stringify({ childPlacement: 'header', children: treeData.value } satisfies NavRoot, null, 2)
)

// ── 页面配置文件编辑（内嵌在右侧 Tab 中）──
const PAGE_FILE_NAMES = ['rule.json', 'pagedata.json', 'script.js', 'style.css'] as const
const editFiles = reactive<Record<string, string>>({
  'rule.json': '', 'pagedata.json': '', 'script.js': '', 'style.css': '',
})
const fileDirty = reactive<Record<string, boolean>>({
  'rule.json': false, 'pagedata.json': false, 'script.js': false, 'style.css': false,
})
const fileSaving = ref(false)
const fileLoaded = ref(false) // 当前节点的文件是否已加载

const hasAnyFileDirty = computed(() => Object.values(fileDirty).some(Boolean))

import { PAGE_API, NAV_API } from '@/services/api-paths'

// ════════════════════════════════════════════════
// 加载
// ════════════════════════════════════════════════
async function loadNavConfig() {
  navLoading.value = true
  try {
    const resp = await fetch(NAV_API)
    if (!resp.ok) throw new Error()
    const config = await resp.json() as { childPlacement?: string; children?: NavNode[] }
    treeData.value = config.children?.length ? config.children : deepClone(demoNavRoot.children)
  } catch {
    treeData.value = deepClone(demoNavRoot.children)
  } finally {
    navLoading.value = false
  }
}

async function loadPageFiles(pageId: string) {
  fileLoaded.value = false
  for (const k of PAGE_FILE_NAMES) {
    fileDirty[k] = false
    editFiles[k] = ''
  }
  for (const fname of PAGE_FILE_NAMES) {
    try {
      const resp = await fetch(`${PAGE_API}/${pageId}/${fname}`)
      editFiles[fname] = resp.ok
        ? ((await resp.json() as Record<string, string>)['content'] ?? '')
        : ''
    } catch {
      editFiles[fname] = ''
    }
  }
  fileLoaded.value = true
}

// ════════════════════════════════════════════════
// 保存
// ════════════════════════════════════════════════
async function saveNavConfig() {
  if (navDirty.value) applyNavChanges()
  navSaving.value = true
  const root: NavRoot = { childPlacement: 'header', children: treeData.value }
  try {
    const resp = await fetch(NAV_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(root),
    })
    if (!resp.ok) throw new Error(await resp.text())
    navDirty.value = false
    ElMessage.success('导航配置已保存')
  } catch (e) {
    ElMessage.error('导航保存失败: ' + String(e))
  } finally {
    navSaving.value = false
  }
}

async function savePageFiles() {
  const pageId = editForm.pageId
  if (!pageId) return
  fileSaving.value = true
  try {
    const resp = await fetch(`${PAGE_API}/${pageId}/__batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editFiles),
    })
    if (!resp.ok) throw new Error(await resp.text())
    for (const k of PAGE_FILE_NAMES) fileDirty[k] = false
    ElMessage.success(`页面 ${pageId} 配置文件已保存`)
  } catch (e) {
    ElMessage.error('保存失败: ' + String(e))
  } finally {
    fileSaving.value = false
  }
}

async function saveAll() {
  if (navDirty.value || hasAnyFileDirty.value) {
    if (navDirty.value) await saveNavConfig()
    if (hasAnyFileDirty.value) await savePageFiles()
  } else {
    await saveNavConfig()
  }
}

// ════════════════════════════════════════════════
// 树节点选中 → 加载右侧
// ════════════════════════════════════════════════
function handleNodeClick(data: NavNode) {
  // 先保存当前未保存的节点修改
  if (navDirty.value && selectedNode.value) applyNavChanges()
  selectedNode.value = data
  loadNodeToForm(data)
  rightTab.value = 'props'
  // 有 pageId 时自动加载配置文件
  if (data.pageId) {
    void loadPageFiles(data.pageId)
  } else {
    fileLoaded.value = false
    for (const k of PAGE_FILE_NAMES) { editFiles[k] = ''; fileDirty[k] = false }
  }
}

function handleTabChange(tab: string) {
  // 切换到文件 Tab 时，如果文件还没加载过，立即加载
  if (tab !== 'props' && editForm.pageId && !fileLoaded.value) {
    void loadPageFiles(editForm.pageId)
  }
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

  if (node.context) {
    hasContext.value = true
    if (Array.isArray(node.context)) {
      contextItems.value = node.context.map(i => ({ id: String(i.id), title: i.title }))
      contextConfig.placeholder = ''; contextConfig.defaultValue = ''; contextConfig.paramName = ''
    } else if (typeof node.context === 'object') {
      const cfg = node.context as { source?: unknown; placeholder?: string; defaultValue?: unknown; paramName?: string }
      contextItems.value = Array.isArray(cfg.source)
        ? (cfg.source as NavContextItem[]).map(i => ({ id: String(i.id), title: i.title }))
        : []
      contextConfig.placeholder = cfg.placeholder ?? ''
      contextConfig.defaultValue = cfg.defaultValue != null ? String(cfg.defaultValue) : ''
      contextConfig.paramName = cfg.paramName ?? ''
    }
  } else {
    hasContext.value = false
    contextItems.value = []; contextConfig.placeholder = ''; contextConfig.defaultValue = ''; contextConfig.paramName = ''
  }
  navDirty.value = false
}

function markNavDirty() { navDirty.value = true }

/** pageId 下拉变更 → 标记脏 + 自动加载文件 */
function handlePageIdChange(val: string) {
  markNavDirty()
  if (val) {
    void loadPageFiles(val)
  } else {
    fileLoaded.value = false
    for (const k of PAGE_FILE_NAMES) { editFiles[k] = ''; fileDirty[k] = false }
  }
}

function applyNavChanges() {
  if (!selectedNode.value) return
  const node = selectedNode.value
  const patch: Record<string, unknown> = { id: editForm.id, title: editForm.title }

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

  const optKeys: (keyof NavNode)[] = [
    'icon', 'type', 'path', 'pageId', 'redirect', 'externalUrl',
    'childPlacement', 'order', 'hidden', 'disabled', 'affix', 'badge', 'context',
  ]
  for (const k of optKeys) {
    if (!(k in patch)) delete (node as Record<string, unknown>)[k]
  }
  Object.assign(node, patch)
  navDirty.value = false
}

// ════════════════════════════════════════════════
// 树增删
// ════════════════════════════════════════════════
function addRootNode() {
  const id = `module-${Date.now()}`
  treeData.value.push({ id, title: '新模块', icon: '📁', childPlacement: 'sidebar', children: [] })
}

function addChildNode(parent: NavNode) {
  const id = `page-${Date.now()}`;
  (parent.children ??= []).push({ id, title: '新页面', icon: '📄', path: `/${id}` })
}

async function removeNode(node: { parent: { data: NavNode } }, data: NavNode) {
  try {
    await ElMessageBox.confirm(
      `确定删除 "${data.title}"？${data.children?.length ? `（含 ${data.children.length} 个子节点）` : ''}`,
      '确认删除', { type: 'warning' }
    )
  } catch { return }
  const parent = node.parent
  if (parent?.data?.children) {
    const idx = parent.data.children.indexOf(data)
    if (idx >= 0) parent.data.children.splice(idx, 1)
  } else {
    const idx = treeData.value.indexOf(data)
    if (idx >= 0) treeData.value.splice(idx, 1)
  }
  if (selectedNode.value === data) selectedNode.value = null
}

function handleNodeDrop() { /* el-tree 自动修改 treeData */ }

function expandAll() { for (const k of getAllKeys(treeData.value)) treeRef.value?.getNode(k)?.expand() }
function collapseAll() { for (const k of getAllKeys(treeData.value)) treeRef.value?.getNode(k)?.collapse() }
function getAllKeys(nodes: NavNode[]): string[] {
  return nodes.flatMap(n => [n.id, ...(n.children ? getAllKeys(n.children) : [])])
}

// ── 上下文编辑 ──
function toggleContext(val: boolean) {
  if (val && contextItems.value.length === 0) contextItems.value.push({ id: '', title: '' })
  markNavDirty()
}
function addContextItem() { contextItems.value.push({ id: '', title: '' }); markNavDirty() }
function removeContextItem(idx: number) { contextItems.value.splice(idx, 1); markNavDirty() }

// ════════════════════════════════════════════════
// 新建页面
// ════════════════════════════════════════════════
const createVisible = ref(false)
const creating = ref(false)
const createFormRef = ref<FormInstance>()
const createForm = reactive({ pageId: '', title: '', icon: '📄', linkToNav: false })
const createRules: FormRules = {
  pageId: [
    { required: true, message: '必填', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/, message: '英文/数字/横线', trigger: 'blur' },
  ],
  title: [{ required: true, message: '必填', trigger: 'blur' }],
}

function showCreateDialog() {
  createForm.pageId = ''; createForm.title = ''; createForm.icon = '📄'; createForm.linkToNav = false
  createVisible.value = true
}

async function doCreate() {
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return
  creating.value = true
  try {
    const resp = await fetch(`${PAGE_API}/__create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: createForm.pageId, title: createForm.title, icon: createForm.icon }),
    })
    if (!resp.ok) {
      const err = await resp.json() as Record<string, string>
      throw new Error(err['error'] ?? '创建失败')
    }

    // 整合：同步将 pageId 写入当前节点
    if (createForm.linkToNav && selectedNode.value) {
      editForm.pageId = createForm.pageId
      markNavDirty()
      applyNavChanges()
      await saveNavConfig()
      // 加载新建的空文件
      void loadPageFiles(createForm.pageId)
    }

    ElMessage.success(`页面 ${createForm.pageId} 创建成功`)
    createVisible.value = false
  } catch (e) {
    ElMessage.error(String(e))
  } finally {
    creating.value = false
  }
}

// ════════════════════════════════════════════════
// 预览 / AI 调试
// ════════════════════════════════════════════════
function previewPage() {
  if (editForm.path) void router.push(editForm.path)
}

function openAiDebug() {
  if (editForm.path) void router.push({ path: editForm.path, query: { aiDebug: '1' } })
}

// ════════════════════════════════════════════════
// 工具
// ════════════════════════════════════════════════
async function resetToDemo() {
  try {
    await ElMessageBox.confirm('确定重置为演示导航？当前修改将丢失。', '确认', { type: 'warning' })
  } catch { return }
  treeData.value = deepClone(demoNavRoot.children)
  selectedNode.value = null; navDirty.value = false
  ElMessage.success('已重置')
}

function copyJson() {
  void navigator.clipboard.writeText(previewJson.value).then(() => ElMessage.success('已复制'))
}

function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)) as T }

// 初始化
onMounted(() => { void loadNavConfig() })
</script>

<style scoped>
.site-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  gap: 12px;
}

/* ── 顶栏 ── */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── 主体 ── */
.main-body {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

/* ── 左侧树面板 ── */
.tree-panel {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fafafa;
  overflow: hidden;
}

.panel-toolbar {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.tree-panel :deep(.el-tree) {
  flex: 1;
  overflow: auto;
  background: transparent;
  padding: 4px;
}

/* 树节点 */
.tree-node {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  font-size: 13px;
  overflow: hidden;
}
.node-label { flex-shrink: 0; font-weight: 500; }
.node-path { color: #909399; font-size: 11px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-tag { flex-shrink: 0; }
.node-actions { margin-left: auto; flex-shrink: 0; opacity: 0; transition: opacity .15s; }
:deep(.el-tree-node__content:hover) .node-actions { opacity: 1; }

/* ── 右侧面板 ── */
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.right-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.right-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
  padding: 12px;
}

.props-scroll {
  max-height: 100%;
  overflow: auto;
}

.right-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-top: 1px solid #ebeef5;
  flex-shrink: 0;
  background: #fafafa;
}
.right-footer-left, .right-footer-right { display: flex; gap: 8px; }

.context-items { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.context-item-row { display: flex; gap: 8px; align-items: center; }

/* ── 文件脏标记 ── */
.file-dirty { color: #e6a23c; font-weight: 600; }
.file-dirty::after { content: ' •'; }
</style>
