<template>
  <div class="dev-file-editor">
    <template v-if="state.activePageId.value">
      <div class="file-tabs">
        <span class="file-page-id">📑 {{ state.activePageId.value }}</span>
        <el-tabs v-model="activeFile" type="card" class="file-tab-bar">
          <el-tab-pane v-for="f in PAGE_FILE_NAMES" :key="f" :name="f">
            <template #label>
              <span :class="{ 'file-dirty': state.fileDirty[f] }">
                {{ fileIcon(f) }} {{ f }}
              </span>
            </template>
          </el-tab-pane>
        </el-tabs>
        <div class="file-actions">
          <el-button
            v-if="state.hasAnyFileDirty.value"
            size="small"
            type="primary"
            :loading="state.fileSaving.value"
            @click="state.savePageFiles()"
          >
            💾 保存文件
          </el-button>
          <el-button size="small" @click="refreshFiles">🔄 刷新</el-button>
        </div>
      </div>

      <div class="editor-area" v-loading="!state.fileLoaded.value">
        <el-input
          v-model="state.editFiles[activeFile]"
          type="textarea"
          :autosize="{ minRows: 30, maxRows: 60 }"
          class="code-input"
          @input="state.fileDirty[activeFile] = true"
        />
      </div>
    </template>
    <el-empty v-else description="请从页面总览中选择一个配置页面进行编辑" class="empty-hint" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { PAGE_FILE_NAMES } from './useDevState'
import type { DevState } from './useDevState'

const props = defineProps<{ state: DevState }>()
const activeFile = ref<string>('rule.json')

function fileIcon(name: string) {
  if (name.endsWith('.json')) return '📐'
  if (name.endsWith('.js')) return '⚡'
  if (name.endsWith('.css')) return '🎨'
  return '📄'
}

function refreshFiles() {
  if (props.state.activePageId.value) {
    void props.state.loadPageFiles(props.state.activePageId.value)
  }
}
</script>

<style scoped>
.dev-file-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.file-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding: 0 8px;
}

.file-page-id {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
  white-space: nowrap;
  padding-right: 4px;
  border-right: 1px solid var(--el-border-color-lighter);
}

.file-tab-bar {
  flex: 1;
}
.file-tab-bar :deep(.el-tabs__header) {
  margin-bottom: 0;
}

.file-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.editor-area {
  flex: 1;
  overflow: auto;
  padding: 8px;
}

.code-input :deep(textarea) {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.file-dirty {
  color: var(--el-color-warning);
  font-weight: 600;
}
.file-dirty::after {
  content: ' •';
}

.empty-hint {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
