<template>
  <div class="page-manager">
    <el-page-header content="页面配置管理" @back="$router.go(-1)">
      <template #icon><span style="font-size: 20px">📑</span></template>
    </el-page-header>

    <div class="toolbar">
      <el-button type="primary" @click="showCreateDialog">➕ 新建页面</el-button>
      <el-button @click="loadPages">🔄 刷新</el-button>
      <el-input
        v-model="searchText"
        placeholder="搜索页面..."
        clearable
        style="width: 240px; margin-left: auto"
      />
    </div>

    <el-table
      :data="filteredPages"
      v-loading="loading"
      stripe
      border
      highlight-current-row
      style="width: 100%"
    >
      <el-table-column prop="icon" label="" width="50" align="center">
        <template #default="{ row }">
          <span style="font-size: 18px">{{ row.icon }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="pageId" label="Page ID" width="180" sortable />
      <el-table-column prop="title" label="标题" width="200" />
      <el-table-column prop="path" label="路由" width="180" />
      <el-table-column label="配置文件" min-width="240">
        <template #default="{ row }">
          <el-tag 
            v-for="f in row.files" 
            :key="f" 
            size="small" 
            :type="fileTagType(f)"
            style="margin-right: 4px"
          >
            {{ f }}
          </el-tag>
          <el-tag v-if="!row.hasDir" type="danger" size="small">无目录</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="360" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="navigateTo(row)">
            🔍 查看
          </el-button>
          <el-button size="small" type="warning" @click="debugPage(row)">
            🐛 AI 调试
          </el-button>
          <el-button size="small" @click="showEditDialog(row)">
            ✏️ 编辑
          </el-button>
          <el-button size="small" type="danger" @click="confirmDelete(row)">
            🗑️ 删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="summary">
      共 {{ pages.length }} 个配置页面
    </div>

    <!-- 新建页面对话框 -->
    <el-dialog v-model="createVisible" title="新建配置页面" width="480px">
      <el-form :model="createForm" label-width="80px" :rules="createRules" ref="createFormRef">
        <el-form-item label="Page ID" prop="pageId">
          <el-input v-model="createForm.pageId" placeholder="英文/数字/横线，如 order-list" />
        </el-form-item>
        <el-form-item label="页面标题" prop="title">
          <el-input v-model="createForm.title" placeholder="订单列表" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="createForm.icon" placeholder="📄" style="width: 80px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="doCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 编辑配置文件对话框 -->
    <el-dialog v-model="editVisible" :title="`编辑 · ${editPageId}`" width="80%" top="5vh">
      <el-tabs v-model="editTab">
        <el-tab-pane label="rule.json" name="rule.json">
          <el-input v-model="editFiles['rule.json']" type="textarea" :rows="20" 
                    style="font-family: monospace; font-size: 13px" />
        </el-tab-pane>
        <el-tab-pane label="pagedata.json" name="pagedata.json">
          <el-input v-model="editFiles['pagedata.json']" type="textarea" :rows="20"
                    style="font-family: monospace; font-size: 13px" />
        </el-tab-pane>
        <el-tab-pane label="script.js" name="script.js">
          <el-input v-model="editFiles['script.js']" type="textarea" :rows="20"
                    style="font-family: monospace; font-size: 13px" />
        </el-tab-pane>
        <el-tab-pane label="style.css" name="style.css">
          <el-input v-model="editFiles['style.css']" type="textarea" :rows="20"
                    style="font-family: monospace; font-size: 13px" />
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doSave">保存全部</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { http } from '@/services/http'

const router = useRouter()

// ── 状态 ──
const loading = ref(false)
const pages = ref<Array<Record<string, unknown>>>([])
const searchText = ref('')

const filteredPages = computed(() => {
  const q = searchText.value.toLowerCase()
  if (!q) return pages.value
  return pages.value.filter(p =>
    String(p['pageId']).toLowerCase().includes(q) ||
    String(p['title']).toLowerCase().includes(q)
  )
})

import { getPageApi } from '@/services/api-paths'

// ── API ──

async function loadPages() {
  loading.value = true
  try {
    pages.value = await http.get<Array<Record<string, unknown>>>(`${getPageApi()}/__list`)
  } catch (e) {
    ElMessage.error('加载页面列表失败: ' + String(e))
  } finally {
    loading.value = false
  }
}

// ── 新建页面 ──
const createVisible = ref(false)
const creating = ref(false)
const createFormRef = ref<FormInstance>()
const createForm = reactive({ pageId: '', title: '', icon: '📄' })
const createRules: FormRules = {
  pageId: [
    { required: true, message: '必填', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/, message: '英文/数字/横线，首字符不能为横线', trigger: 'blur' }
  ],
  title: [{ required: true, message: '必填', trigger: 'blur' }]
}

function showCreateDialog() {
  createForm.pageId = ''
  createForm.title = ''
  createForm.icon = '📄'
  createVisible.value = true
}

async function doCreate() {
  const form = createFormRef.value
  if (form) {
    const valid = await form.validate().catch(() => false)
    if (!valid) return
  }
  creating.value = true
  try {
    await http.post(`${getPageApi()}/__create`, createForm)
    ElMessage.success(`页面 ${createForm.pageId} 创建成功`)
    createVisible.value = false
    await loadPages()
  } catch (e) {
    const errMsg = (e instanceof Error && 'response' in e)
      ? ((e as { response?: unknown }).response as Record<string, string> | undefined)?.['error'] ?? e.message
      : String(e)
    ElMessage.error(errMsg)
  } finally {
    creating.value = false
  }
}

// ── 删除页面 ──
async function confirmDelete(row: Record<string, unknown>) {
  const pageId = String(row['pageId'])
  try {
    await ElMessageBox.confirm(
      `确定删除页面 "${row['title']}" (${pageId})？\n此操作将删除所有配置文件且不可恢复。`,
      '确认删除',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    await http.delete(`${getPageApi()}/${pageId}`)
    ElMessage.success(`页面 ${pageId} 已删除`)
    await loadPages()
  } catch (e) {
    const errMsg = (e instanceof Error && 'response' in e)
      ? ((e as { response?: unknown }).response as Record<string, string> | undefined)?.['error'] ?? e.message
      : String(e)
    ElMessage.error(errMsg)
  }
}

// ── 查看页面 ──
function navigateTo(row: Record<string, unknown>) {
  const path = String(row['path'])
  void router.push(path)
}

// ── AI 调试 ──
function debugPage(row: Record<string, unknown>) {
  const path = String(row['path'])
  // 导航到目标页面，并通过 query 标记需要自动打开 AI 调试
  void router.push({ path, query: { aiDebug: '1' } })
}

// ── 编辑配置文件 ──
const editVisible = ref(false)
const editPageId = ref('')
const editTab = ref('rule.json')
const editFiles = reactive<Record<string, string>>({
  'rule.json': '',
  'pagedata.json': '',
  'script.js': '',
  'style.css': ''
})
const saving = ref(false)

async function showEditDialog(row: Record<string, unknown>) {
  const pageId = String(row['pageId'])
  editPageId.value = pageId
  editTab.value = 'rule.json'

  // 加载 4 个文件
  const fileNames = ['rule.json', 'pagedata.json', 'script.js', 'style.css']
  for (const fname of fileNames) {
    try {
      const data = await http.get<Record<string, string>>(`${getPageApi()}/${pageId}/${fname}`)
      editFiles[fname] = data['content'] ?? ''
    } catch {
      editFiles[fname] = ''
    }
  }
  editVisible.value = true
}

async function doSave() {
  saving.value = true
  try {
    await http.post(`${getPageApi()}/${editPageId.value}/__batch`, editFiles)
    ElMessage.success('保存成功')
    editVisible.value = false
    await loadPages()
  } catch (e) {
    ElMessage.error('保存失败: ' + String(e))
  } finally {
    saving.value = false
  }
}

// ── 工具函数 ──
function fileTagType(f: string): 'success' | 'warning' | 'info' | undefined {
  if (f === 'rule.json') return undefined
  if (f === 'pagedata.json') return 'success'
  if (f === 'script.js') return 'warning'
  return 'info'
}

onMounted(loadPages)
</script>

<style scoped>
.page-manager {
  padding: 24px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0;
}
.summary {
  margin-top: 12px;
  color: #909399;
  font-size: 13px;
}
</style>
