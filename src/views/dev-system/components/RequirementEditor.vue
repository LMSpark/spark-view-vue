<template>
  <div class="requirement-editor">
    <div class="editor-header">
      <h2 class="editor-title">📝 {{ requirement?.title ?? '未知需求' }}</h2>
      <div class="editor-actions">
        <el-button size="small" @click="goBack">← 返回</el-button>
        <el-popconfirm title="确认删除该需求？" @confirm="handleDelete">
          <template #reference>
            <el-button size="small" type="danger">删除</el-button>
          </template>
        </el-popconfirm>
      </div>
    </div>

    <el-form v-if="requirement" label-position="top" class="editor-form">
      <el-form-item label="标题">
        <el-input v-model="editTitle" @change="save" placeholder="需求标题" maxlength="100" show-word-limit />
      </el-form-item>

      <el-form-item label="描述">
        <el-input
          v-model="editDesc"
          type="textarea"
          :rows="6"
          @change="save"
          placeholder="详细描述需求背景、用户场景、核心功能…"
          maxlength="5000"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="状态">
        <el-radio-group v-model="editStatus" @change="save">
          <el-radio-button value="draft">草稿</el-radio-button>
          <el-radio-button value="analyzed">已分析</el-radio-button>
          <el-radio-button value="planned">已规划</el-radio-button>
          <el-radio-button value="completed">已完成</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="requirement.aiSummary" label="AI 分析摘要">
        <div class="ai-summary-box">{{ requirement.aiSummary }}</div>
      </el-form-item>

      <el-form-item v-if="requirement.relatedModules.length" label="关联模块">
        <div class="related-modules">
          <el-tag
            v-for="modId in requirement.relatedModules"
            :key="modId"
            size="small"
            class="related-tag"
            @click="gotoModule(modId)"
          >
            {{ moduleName(modId) }}
          </el-tag>
        </div>
      </el-form-item>

      <el-form-item label="创建时间">
        <span class="meta-text">{{ formatTime(requirement.createdAt) }}</span>
      </el-form-item>
    </el-form>

    <el-empty v-else description="未找到该需求" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useProject } from '../composables/useProjectInject'
import type { RequirementStatus } from '../composables/types'

const props = defineProps<{
  requirementId: string
}>()

const project = useProject()

const requirement = computed(() =>
  project.state.requirements.find(r => r.id === props.requirementId),
)

const editTitle = ref('')
const editDesc = ref('')
const editStatus = ref<RequirementStatus>('draft')

// 当需求变化时同步本地编辑状态
watch(
  () => props.requirementId,
  () => {
    const req = requirement.value
    if (req) {
      editTitle.value = req.title
      editDesc.value = req.description
      editStatus.value = req.status
    }
  },
  { immediate: true },
)

function save() {
  project.updateRequirement(props.requirementId, {
    title: editTitle.value,
    description: editDesc.value,
    status: editStatus.value,
  })
}

function handleDelete() {
  project.removeRequirement(props.requirementId)
  project.setFocus({ view: 'overview' })
}

function goBack() {
  project.setFocus({ view: 'overview' })
}

function gotoModule(modId: string) {
  project.setFocus({ view: 'module', moduleId: modId })
}

function moduleName(modId: string): string {
  const mod = project.state.modules.find(m => m.id === modId)
  return mod?.name ?? modId
}

function formatTime(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-CN')
}
</script>

<style scoped>
.requirement-editor {
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
  margin-bottom: 16px;
}

.ai-summary-box {
  padding: 12px;
  background: var(--el-color-primary-light-9);
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.related-modules {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.related-tag {
  cursor: pointer;
}

.meta-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
