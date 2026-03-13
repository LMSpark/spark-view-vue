<template>
  <div class="module-planner">
    <div class="editor-header">
      <h2 class="editor-title">🏗️ 功能规划</h2>
      <el-button type="primary" size="small" @click="showAddDialog = true">+ 新增模块</el-button>
    </div>

    <div class="summary-stats">
      <span><strong>{{ project.state.modules.length }}</strong> 个模块</span>
      <span><strong>{{ totalPages }}</strong> 个页面</span>
    </div>

    <p class="hint-text">从左侧树选择模块进行编辑，或点击上方按钮添加新模块</p>

    <!-- 新增模块对话框 -->
    <el-dialog v-model="showAddDialog" title="新增功能模块" width="480px" @close="resetForm">
      <el-form label-position="top">
        <el-form-item label="模块名称" required>
          <el-input v-model="newName" placeholder="如：订单管理" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="newDesc" type="textarea" :rows="3" placeholder="模块功能描述" maxlength="1000" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="newIcon" placeholder="如：📦" style="width: 100px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="handleAdd" :disabled="!newName.trim()">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProject } from '../composables/useProjectInject'

const project = useProject()

const showAddDialog = ref(false)
const newName = ref('')
const newDesc = ref('')
const newIcon = ref('📦')

const totalPages = computed(() =>
  project.state.modules.reduce((sum, m) => sum + m.pages.length, 0),
)

function resetForm() {
  newName.value = ''
  newDesc.value = ''
  newIcon.value = '📦'
}

function handleAdd() {
  const name = newName.value.trim()
  if (!name) return
  project.addModule({
    id: crypto.randomUUID(),
    name,
    icon: newIcon.value || '📦',
    description: newDesc.value.trim(),
    pages: [],
    requirementId: '',
    status: 'planned',
  })
  showAddDialog.value = false
  resetForm()
}
</script>

<style scoped>
.module-planner {
  max-width: 600px;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.editor-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.summary-stats {
  display: flex;
  gap: 20px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 16px;
}

.hint-text {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}
</style>
