<template>
  <div class="page-designer">
    <div class="editor-header">
      <h2 class="editor-title">📄 {{ pagePlan?.title ?? props.pageId }}</h2>
      <div class="editor-actions">
        <el-button size="small" @click="goBack">← 返回模块</el-button>
      </div>
    </div>

    <template v-if="pagePlan">
      <!-- 基本信息 -->
      <el-form label-position="top" class="editor-form">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="页面标题">
              <el-input v-model="editTitle" @change="save" maxlength="50" show-word-limit />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="页面 ID">
              <el-input :model-value="pagePlan.pageId" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="类型">
              <el-select v-model="editType" @change="save" style="width: 100%">
                <el-option value="list" label="列表页" />
                <el-option value="detail" label="详情页" />
                <el-option value="form" label="表单页" />
                <el-option value="dashboard" label="仪表盘" />
                <el-option value="tree" label="树形页" />
                <el-option value="custom" label="自定义" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="描述">
          <el-input v-model="editDesc" type="textarea" :rows="3" @change="save" maxlength="2000" show-word-limit />
        </el-form-item>

        <el-form-item label="状态">
          <el-radio-group v-model="editStatus" @change="save">
            <el-radio-button value="planned">计划中</el-radio-button>
            <el-radio-button value="designing">设计中</el-radio-button>
            <el-radio-button value="generated">已生成</el-radio-button>
            <el-radio-button value="verified">已验证</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="数据实体">
          <div class="entity-tags">
            <el-tag
              v-for="entity in editEntities"
              :key="entity"
              closable
              size="small"
              @close="removeEntity(entity)"
            >
              {{ entity }}
            </el-tag>
            <el-input
              v-if="showEntityInput"
              ref="entityInputRef"
              v-model="newEntity"
              size="small"
              style="width: 120px"
              @keyup.enter="addEntity"
              @blur="addEntity"
              placeholder="实体名"
            />
            <el-button v-else size="small" @click="showEntityInput = true">+ 实体</el-button>
          </div>
        </el-form-item>
      </el-form>

      <!-- AI 设计状态 -->
      <section v-if="designState" class="design-section">
        <h3>🤖 AI 设计状态</h3>
        <div class="design-meta">
          <el-tag size="small">阶段: {{ designState.phase }}</el-tag>
          <el-tag size="small" type="info">对话: {{ designState.chatHistory.length }} 条</el-tag>
          <el-tag size="small" type="success">方案: {{ designState.proposals.length }} 个</el-tag>
        </div>

        <div v-if="designState.proposals.length" class="proposals-list">
          <div v-for="p in designState.proposals" :key="p.id" class="proposal-item">
            <div class="proposal-header">
              <span class="proposal-title">{{ p.title }}</span>
              <el-tag size="small" :type="proposalStatusType(p.status)">{{ p.status }}</el-tag>
            </div>
            <div class="proposal-content">{{ truncate(p.content, 200) }}</div>
          </div>
        </div>
      </section>
    </template>

    <el-empty v-else description="未找到该页面" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useProject } from '../composables/useProjectInject'
import type { PagePlan } from '../composables/types'
import type { ProposalStatus } from '@/composables/useDesignSession'

const props = defineProps<{
  pageId: string
}>()

const project = useProject()

// 查找页面所在模块和页面数据
const parentModule = computed(() =>
  project.state.modules.find(m => m.pages.some(p => p.pageId === props.pageId)),
)

const pagePlan = computed(() =>
  parentModule.value?.pages.find(p => p.pageId === props.pageId),
)

const designState = computed(() =>
  project.state.pageDesignStates.get(props.pageId),
)

const editTitle = ref('')
const editDesc = ref('')
const editType = ref<PagePlan['pageType']>('list')
const editStatus = ref<PagePlan['status']>('planned')
const editEntities = ref<string[]>([])

watch(
  () => props.pageId,
  () => {
    const p = pagePlan.value
    if (p) {
      editTitle.value = p.title
      editDesc.value = p.description
      editType.value = p.pageType
      editStatus.value = p.status
      editEntities.value = [...p.dataEntities]
    }
  },
  { immediate: true },
)

function save() {
  const mod = parentModule.value
  if (!mod) return
  project.updatePageInModule(mod.id, props.pageId, {
    title: editTitle.value,
    description: editDesc.value,
    pageType: editType.value,
    status: editStatus.value,
    dataEntities: editEntities.value,
  })
}

function goBack() {
  const mod = parentModule.value
  if (mod) {
    project.setFocus({ view: 'module', moduleId: mod.id })
  } else {
    project.setFocus({ view: 'functions' })
  }
}

// ── 数据实体管理 ────────────────────────────────────────────

const showEntityInput = ref(false)
const newEntity = ref('')
const entityInputRef = ref()

watch(showEntityInput, async (v) => {
  if (v) {
    await nextTick()
    entityInputRef.value?.focus()
  }
})

function addEntity() {
  const name = newEntity.value.trim()
  if (name && !editEntities.value.includes(name)) {
    editEntities.value.push(name)
    save()
  }
  newEntity.value = ''
  showEntityInput.value = false
}

function removeEntity(name: string) {
  editEntities.value = editEntities.value.filter(e => e !== name)
  save()
}

// ── 辅助 ────────────────────────────────────────────────────

function proposalStatusType(status: ProposalStatus) {
  const map: Record<ProposalStatus, 'info' | 'warning' | 'success' | 'danger'> = {
    pending: 'warning',
    accepted: 'success',
    rejected: 'danger',
  }
  return map[status]
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}
</script>

<style scoped>
.page-designer {
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

.entity-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.design-section {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.design-section h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}

.design-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.proposals-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.proposal-item {
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.proposal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.proposal-title {
  font-size: 14px;
  font-weight: 600;
}

.proposal-content {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
