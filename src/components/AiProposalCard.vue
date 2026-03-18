<template>
  <div class="proposal-card" :class="[`type-${proposal.type}`, `status-${proposal.status}`]">
    <div class="proposal-header">
      <span class="proposal-icon"><NavIcon :name="icon" /></span>
      <span v-if="!editingTitle" class="proposal-title" @dblclick="startEditTitle">{{ proposal.title }}</span>
      <input
        v-else
        ref="titleInputRef"
        v-model="editTitleText"
        class="proposal-title-input"
        @blur="commitTitleEdit"
        @keydown.enter.prevent="commitTitleEdit"
        @keydown.escape.prevent="cancelTitleEdit"
      />
      <span v-if="proposal.status === 'accepted'" class="status-badge accepted">✅ 已采纳</span>
      <span v-else-if="proposal.status === 'rejected'" class="status-badge rejected">⏭️ 已跳过</span>
    </div>
    <details class="proposal-details">
      <summary>查看内容</summary>
      <pre v-if="!editingContent" class="proposal-content" @dblclick="startEditContent"><code>{{ proposal.content }}</code></pre>
      <textarea
        v-else
        ref="contentInputRef"
        v-model="editContentText"
        class="proposal-content-edit"
        rows="8"
        @blur="commitContentEdit"
        @keydown.escape.prevent="cancelContentEdit"
      />
      <div v-if="!editingContent" class="edit-hint">💡 双击内容可编辑</div>
    </details>
    <div v-if="proposal.status === 'pending'" class="proposal-actions">
      <button class="btn-accept" @click="$emit('accept', proposal.id)" title="采纳此设计决策">
        ✅ 采纳
      </button>
      <button class="btn-reject" @click="$emit('reject', proposal.id)" title="跳过此提案">
        ⏭️ 跳过
      </button>
      <button class="btn-discuss" @click="$emit('discuss', proposal)" title="继续讨论此提案">
        💬 讨论
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { typeIcon } from '@spark-view/spark-ai'
import type { DesignProposal } from '@spark-view/spark-ai'
import { NavIcon } from '@spark-view/spark-app'

const props = defineProps<{
  proposal: DesignProposal
}>()

const emit = defineEmits<{
  accept: [id: string]
  reject: [id: string]
  discuss: [proposal: DesignProposal]
  editContent: [id: string, content: string]
  editTitle: [id: string, title: string]
}>()

const icon = computed(() => typeIcon(props.proposal.type))

// ── 编辑标题 ──
const editingTitle = ref(false)
const editTitleText = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

function startEditTitle() {
  editTitleText.value = props.proposal.title
  editingTitle.value = true
  void nextTick(() => titleInputRef.value?.focus())
}

function commitTitleEdit() {
  if (!editingTitle.value) return
  const val = editTitleText.value.trim()
  if (val && val !== props.proposal.title) {
    emit('editTitle', props.proposal.id, val)
  }
  editingTitle.value = false
}

function cancelTitleEdit() {
  editingTitle.value = false
}

// ── 编辑内容 ──
const editingContent = ref(false)
const editContentText = ref('')
const contentInputRef = ref<HTMLTextAreaElement | null>(null)

function startEditContent() {
  editContentText.value = props.proposal.content
  editingContent.value = true
  void nextTick(() => contentInputRef.value?.focus())
}

function commitContentEdit() {
  if (!editingContent.value) return
  const val = editContentText.value.trim()
  if (val && val !== props.proposal.content) {
    emit('editContent', props.proposal.id, val)
  }
  editingContent.value = false
}

function cancelContentEdit() {
  editingContent.value = false
}
</script>

<style scoped>
.proposal-card {
  margin: 8px 0;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fafbfc;
  overflow: hidden;
  transition: border-color 0.2s;
}

.proposal-card.status-accepted {
  border-color: #67c23a;
  background: #f0f9eb;
}

.proposal-card.status-rejected {
  border-color: #c0c4cc;
  background: #f5f5f5;
  opacity: 0.6;
}

.proposal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
}

.proposal-icon {
  font-size: 16px;
}

.proposal-title {
  flex: 1;
  color: #303133;
}

.status-badge {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}

.status-badge.accepted {
  color: #67c23a;
}

.proposal-details {
  padding: 0 12px;
}

.proposal-details summary {
  cursor: pointer;
  font-size: 12px;
  color: #909399;
  padding: 4px 0;
  user-select: none;
}

.proposal-content {
  margin: 4px 0 8px;
  padding: 8px 10px;
  background: #282c34;
  color: #abb2bf;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.proposal-actions {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid #ebeef5;
}

.proposal-actions button {
  flex: 1;
  padding: 6px 0;
  font-size: 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-accept:hover {
  border-color: #67c23a;
  color: #67c23a;
  background: #f0f9eb;
}

.btn-reject:hover {
  border-color: #909399;
  color: #606266;
  background: #f5f7fa;
}

.btn-discuss:hover {
  border-color: #409eff;
  color: #409eff;
  background: #ecf5ff;
}

.proposal-title-input {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  border: 1px solid #409eff;
  border-radius: 4px;
  padding: 2px 6px;
  outline: none;
  background: #fff;
}

.proposal-content-edit {
  width: 100%;
  margin: 4px 0 8px;
  padding: 8px 10px;
  background: #282c34;
  color: #abb2bf;
  border: 1px solid #409eff;
  border-radius: 6px;
  font-size: 12px;
  font-family: monospace;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}

.edit-hint {
  font-size: 11px;
  color: #c0c4cc;
  text-align: right;
  padding: 0 4px 4px;
}
</style>
