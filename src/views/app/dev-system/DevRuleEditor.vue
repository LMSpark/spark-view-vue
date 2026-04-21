<template>
  <div class="rule-editor">
    <!-- ═══ 主体双栏 ═══ -->
    <div class="re-body">
      <!-- 左侧：4 文件编辑器（rule.json / pagedata.json / script.js / style.css） -->
      <div class="re-tree">
        <DevFileEditor :state="props.state" :show-ai-bar="false" />
      </div>

      <!-- 右侧：AI 助手 -->
      <div class="re-ai">
        <div class="re-ai__header">
          <NavIcon name="Cpu" :size="16" />
          <span>AI 编辑助手</span>
          <el-tag v-if="session.ready.value" size="small" type="success" effect="plain">已就绪</el-tag>
          <el-tag v-if="session.dirty.value" size="small" type="warning" effect="plain">待导出</el-tag>
        </div>

        <!-- 模式切换 -->
        <div class="re-ai__mode">
          <el-radio-group v-model="aiMode" size="small">
            <el-radio-button label="edit">细粒度编辑</el-radio-button>
            <el-radio-button label="tool">工具模式</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 细粒度编辑模式 -->
        <template v-if="aiMode === 'edit'">
          <label class="re-ai__label">💬 描述你的修改需求：</label>
          <el-input
            v-model="editPrompt"
            type="textarea"
            :rows="4"
            :disabled="session.busy.value"
            placeholder="例如：在表格右侧增加一个「查看详情」按钮列，点击时调用 openDetail 脚本函数"
          />
          <el-button
            type="primary"
            class="re-ai__run"
            :loading="session.busy.value"
            :disabled="!editPrompt.trim() || !props.state.activePageId.value"
            @click="session.runLlm(editPrompt.trim())"
          >
            <NavIcon name="MagicStick" :size="14" /> ✨ 执行编辑
          </el-button>
        </template>

        <!-- 工具模式 -->
        <template v-else>
          <label class="re-ai__label">🔧 选择工具：</label>
          <el-select v-model="selectedAction" size="small" style="width: 100%" filterable placeholder="选择 sparkNodeTree.* 工具">
            <el-option-group label="查询">
              <el-option v-for="a in TOOL_READ_ACTIONS" :key="a" :label="a" :value="a" />
            </el-option-group>
            <el-option-group label="写入">
              <el-option v-for="a in TOOL_WRITE_ACTIONS" :key="a" :label="a" :value="a" />
            </el-option-group>
          </el-select>

          <label class="re-ai__label" style="margin-top: 8px">📋 参数 JSON：</label>
          <el-input
            v-model="toolParams"
            type="textarea"
            :rows="6"
            :disabled="session.busy.value"
            spellcheck="false"
            placeholder="{}"
            style="font-family: monospace; font-size: 12px"
          />
          <div class="re-ai__tool-actions">
            <el-button
              size="small"
              :disabled="!selectedAction || !props.state.activePageId.value"
              @click="fillExample"
            >
              填入示例
            </el-button>
            <el-button
              type="primary"
              size="small"
              :loading="session.busy.value"
              :disabled="!selectedAction || !props.state.activePageId.value"
              @click="session.execTool(selectedAction, toolParams)"
            >
              <NavIcon name="Lightning" :size="12" /> 执行
            </el-button>
          </div>
        </template>

        <!-- 导出并应用（仅当会话 dirty 时） -->
        <div v-if="session.dirty.value" class="re-ai__export-bar">
          <el-alert
            title="SparkNode 树已在会话中修改，点击「导出并应用」写回 rule.json"
            type="warning"
            :closable="false"
            show-icon
            style="margin-bottom: 6px"
          />
          <el-button
            type="warning"
            size="small"
            :loading="session.busy.value"
            @click="session.exportAndApply"
          >
            <NavIcon name="Upload" :size="12" /> 导出并应用
          </el-button>
        </div>

        <!-- 重置会话 -->
        <div class="re-ai__session-bar">
          <el-button
            size="small"
            :disabled="session.busy.value"
            @click="session.reset"
          >
            <NavIcon name="Refresh" :size="12" /> 重置会话
          </el-button>
        </div>

        <!-- 执行日志 -->
        <div class="re-ai__log-header">
          <span>执行日志</span>
          <el-tag size="small" type="info" effect="plain">{{ session.log.value.length }}</el-tag>
        </div>
        <div class="re-ai__log">
          <div v-if="session.log.value.length === 0" class="re-ai__log-empty">
            日志为空，执行操作后此处显示结果
          </div>
          <div
            v-for="(entry, idx) in session.log.value"
            :key="idx"
            class="re-log-entry"
            :class="`re-log-entry--${entry.type}`"
          >
            <span class="re-log-tag">{{ entry.tag }}</span>
            <pre class="re-log-text">{{ entry.text }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import NavIcon from '@/components/NavIcon.vue'
import DevFileEditor from './DevFileEditor.vue'
import {
  useRuleEditSession,
  TOOL_READ_ACTIONS,
  TOOL_WRITE_ACTIONS,
  TOOL_PARAM_EXAMPLES,
} from './composables/useRuleEditSession'
import { PAGE_FILE_NAMES } from './useDevState'
import type { DevState } from './useDevState'

const props = defineProps<{ state: DevState }>()

const session = useRuleEditSession({
  getContextFiles: () => ({ ...props.state.editFiles }),
  onApply: (files) => {
    for (const name of PAGE_FILE_NAMES) {
      if (files[name] !== undefined) props.state.updatePageFile(name, files[name])
    }
  },
  onStatus: (msg, type) => ElMessage({ message: msg, type, duration: 4000 }),
})

watch(() => props.state.activePageId.value, (next, prev) => {
  if (next !== prev) session.reset()
})

// Keep session nodeTree in sync whenever rule.json is edited (via DevFileEditor or onApply).
watch(() => props.state.editFiles['rule.json'], (text) => {
  if (text) session.loadRuleJson(text)
})

const aiMode = ref<'edit' | 'tool'>('edit')
const editPrompt = ref('')
const selectedAction = ref('')
const toolParams = ref('{}')

function fillExample() {
  toolParams.value = TOOL_PARAM_EXAMPLES[selectedAction.value] ?? '{}'
}
</script>

<style scoped>
.rule-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color);
}

/* ── 主体双栏 ── */
.re-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

/* ── 左侧树区域 ── */
.re-tree {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color-light);
}

.re-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

/* ── 右侧 AI 面板 ── */
.re-ai {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  overflow-y: auto;
  background: var(--el-fill-color-light);
}

.re-ai__header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.re-ai__mode {
  flex-shrink: 0;
}

.re-ai__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 2px;
  display: block;
}

.re-ai__run {
  width: 100%;
  margin-top: 4px;
}

.re-ai__tool-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 4px;
}

.re-ai__export-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.re-ai__session-bar {
  display: flex;
  justify-content: flex-end;
}

/* ── 日志 ── */
.re-ai__log-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  border-top: 1px solid var(--el-border-color-light);
  padding-top: 8px;
  margin-top: 4px;
}

.re-ai__log {
  flex: 1 1 auto;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 120px;
  max-height: 400px;
}

.re-ai__log-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 16px 0;
}

.re-log-entry {
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 11.5px;
  background: var(--el-bg-color);
  border-left: 3px solid var(--el-border-color);
}

.re-log-entry--success {
  border-left-color: var(--el-color-success);
}

.re-log-entry--error {
  border-left-color: var(--el-color-danger);
}

.re-log-entry--info {
  border-left-color: var(--el-color-info);
}

.re-log-tag {
  display: block;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 2px;
  font-size: 11px;
}

.re-log-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--el-text-color-primary);
  font-family: monospace;
  font-size: 11px;
  max-height: 160px;
  overflow-y: auto;
}
</style>
