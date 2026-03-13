<template>
  <div class="module-editor">
    <div class="editor-header">
      <h2 class="editor-title">{{ mod?.icon }} {{ mod?.name ?? '未知模块' }}</h2>
      <div class="editor-actions">
        <el-button size="small" @click="goBack">← 返回</el-button>
        <el-popconfirm title="确认删除此模块及其所有页面？" @confirm="handleDelete">
          <template #reference>
            <el-button size="small" type="danger">删除模块</el-button>
          </template>
        </el-popconfirm>
      </div>
    </div>

    <template v-if="mod">
      <!-- 模块基本信息 -->
      <el-form label-position="top" class="editor-form">
        <el-row :gutter="16">
          <el-col :span="3">
            <el-form-item label="图标">
              <el-input v-model="editIcon" @change="save" />
            </el-form-item>
          </el-col>
          <el-col :span="13">
            <el-form-item label="名称">
              <el-input v-model="editName" @change="save" maxlength="50" show-word-limit />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="状态">
              <el-select v-model="editStatus" @change="save" style="width: 100%">
                <el-option value="planned" label="计划中" />
                <el-option value="designing" label="设计中" />
                <el-option value="generated" label="已生成" />
                <el-option value="verified" label="已验证" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="描述">
          <el-input v-model="editDesc" type="textarea" :rows="3" @change="save" maxlength="1000" />
        </el-form-item>
      </el-form>

      <!-- 页面列表 -->
      <section class="pages-section">
        <div class="section-header">
          <h3>📄 页面列表</h3>
          <el-button size="small" type="primary" @click="showAddPage = true">+ 添加页面</el-button>
        </div>

        <el-table v-if="mod.pages.length" :data="mod.pages" stripe size="small" class="pages-table">
          <el-table-column prop="title" label="标题" min-width="150">
            <template #default="{ row }">
              <span class="clickable-cell" @click="gotoPage(row.pageId)">{{ row.title }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="pageId" label="页面 ID" width="160" />
          <el-table-column prop="pageType" label="类型" width="100">
            <template #default="{ row }">
              <el-tag size="small" type="info">{{ row.pageType }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="pageStatusType(row.status)">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text type="primary" @click="gotoPage(row.pageId)">设计</el-button>
              <el-popconfirm title="确认删除此页面？" @confirm="removePage(row.pageId)">
                <template #reference>
                  <el-button size="small" text type="danger">删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-else description="暂无页面" :image-size="60">
          <el-button type="primary" size="small" @click="showAddPage = true">添加第一个页面</el-button>
        </el-empty>
      </section>
    </template>

    <el-empty v-else description="未找到该模块" />

    <!-- 添加页面对话框 -->
    <el-dialog v-model="showAddPage" title="添加页面" width="480px" @close="resetPageForm">
      <el-form label-position="top">
        <el-form-item label="页面标题" required>
          <el-input v-model="newPageTitle" placeholder="如：订单列表" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="页面 ID" required>
          <el-input v-model="newPageId" placeholder="如：order-list（英文中划线）" maxlength="50" />
        </el-form-item>
        <el-form-item label="页面类型">
          <el-select v-model="newPageType" style="width: 100%">
            <el-option value="list" label="列表页" />
            <el-option value="detail" label="详情页" />
            <el-option value="form" label="表单页" />
            <el-option value="dashboard" label="仪表盘" />
            <el-option value="tree" label="树形页" />
            <el-option value="custom" label="自定义" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="newPageDesc" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddPage = false">取消</el-button>
        <el-button type="primary" @click="handleAddPage" :disabled="!newPageTitle.trim() || !newPageId.trim()">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useProject } from '../composables/useProjectInject'
import type { ModuleStatus, PagePlan } from '../composables/types'

const props = defineProps<{
  moduleId: string
}>()

const project = useProject()

const mod = computed(() => project.state.modules.find(m => m.id === props.moduleId))

const editName = ref('')
const editIcon = ref('')
const editDesc = ref('')
const editStatus = ref<ModuleStatus>('planned')

watch(
  () => props.moduleId,
  () => {
    const m = mod.value
    if (m) {
      editName.value = m.name
      editIcon.value = m.icon
      editDesc.value = m.description
      editStatus.value = m.status
    }
  },
  { immediate: true },
)

function save() {
  project.updateModule(props.moduleId, {
    name: editName.value,
    icon: editIcon.value,
    description: editDesc.value,
    status: editStatus.value,
  })
}

function handleDelete() {
  project.removeModule(props.moduleId)
  project.setFocus({ view: 'functions' })
}

function goBack() {
  project.setFocus({ view: 'functions' })
}

function gotoPage(pageId: string) {
  project.setFocus({ view: 'page-design', pageId })
}

function removePage(pageId: string) {
  project.removePageFromModule(props.moduleId, pageId)
}

// ── 添加页面 ────────────────────────────────────────────────

const showAddPage = ref(false)
const newPageTitle = ref('')
const newPageId = ref('')
const newPageType = ref<PagePlan['pageType']>('list')
const newPageDesc = ref('')

function resetPageForm() {
  newPageTitle.value = ''
  newPageId.value = ''
  newPageType.value = 'list'
  newPageDesc.value = ''
}

function handleAddPage() {
  const title = newPageTitle.value.trim()
  const pageId = newPageId.value.trim()
  if (!title || !pageId) return
  project.addPageToModule(props.moduleId, {
    pageId,
    title,
    description: newPageDesc.value.trim(),
    pageType: newPageType.value,
    dataEntities: [],
    status: 'planned',
  })
  showAddPage.value = false
  resetPageForm()
}

function pageStatusType(status: string) {
  if (status === 'generated' || status === 'verified') return 'success' as const
  if (status === 'designing') return 'warning' as const
  return 'info' as const
}
</script>

<style scoped>
.module-editor {
  padding: 20px 24px;
  overflow: auto;
  height: 100%;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.editor-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.editor-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.editor-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.pages-section {
  margin-top: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.pages-table {
  width: 100%;
}

.clickable-cell {
  cursor: pointer;
  color: var(--el-color-primary);
}

.clickable-cell:hover {
  text-decoration: underline;
}
</style>
