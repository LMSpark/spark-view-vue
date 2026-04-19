<!-- 
  DevEditorAiBar — 编辑器 AI 辅助工具栏
  
  提供编辑器级别的 AI 辅助功能：
  - 🔧 修复：检测并修复配置问题
  - ✨ 优化：优化配置结构和命名
  - 📝 补全：补全缺失的必要字段
-->
<template>
  <div class="ai-bar">
    <div class="ai-bar__left">
      <span class="ai-bar__label">🤖 AI 辅助</span>
      <el-dropdown trigger="click" @command="handleCommand">
        <el-button size="small" :loading="loading" :disabled="!enabled">
          <NavIcon name="MagicStick" :size="14" /> {{ currentAction }}
          <NavIcon name="ArrowDown" :size="12" style="margin-left: 4px" />
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="fix">
              <NavIcon name="Tools" :size="14" /> 🔧 修复问题
            </el-dropdown-item>
            <el-dropdown-item command="optimize">
              <NavIcon name="Sunrise" :size="14" /> ✨ 优化配置
            </el-dropdown-item>
            <el-dropdown-item command="complete">
              <NavIcon name="EditPen" :size="14" /> 📝 补全字段
            </el-dropdown-item>
            <el-dropdown-item command="explain" divided>
              <NavIcon name="InfoFilled" :size="14" /> 💡 解释配置
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    
    <div v-if="suggestion" class="ai-bar__suggestion">
      <span class="suggestion-text">{{ suggestion }}</span>
      <el-button size="small" type="primary" text @click="applySuggestion">应用</el-button>
      <el-button size="small" text @click="dismissSuggestion">忽略</el-button>
    </div>
    
    <div v-if="explanation" class="ai-bar__explanation">
      <div class="explanation-content" v-html="explanationHtml" />
      <el-button size="small" text @click="dismissExplanation">关闭</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { getAILoop } from '@spark-view/spark-ai'
import type { PageFileName } from './useDevState'
import NavIcon from '@/components/NavIcon.vue'
import { runAiFileWriteback } from './composables/useAiFileWriteback'

interface Props {
  pageId: string
  fileName: string
  fileContent: string
  enabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  enabled: true,
})

const emit = defineEmits<{
  (e: 'apply', content: string): void
  (e: 'status', message: string, type: 'success' | 'warning' | 'error'): void
}>()

const loading = ref(false)
const currentAction = ref('AI 操作')
const suggestion = ref('')
const suggestedContent = ref('')
const explanation = ref('')

const explanationHtml = computed(() => {
  if (!explanation.value) return ''
  return explanation.value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
})

const loop = computed(() => getAILoop())

function getFileType(): 'json' | 'js' | 'css' {
  if (props.fileName.endsWith('.json')) return 'json'
  if (props.fileName.endsWith('.js')) return 'js'
  return 'css'
}

function buildPrompt(action: string): string {
  const fileType = getFileType()
  const lang = fileType === 'json' ? 'json' : fileType === 'js' ? 'javascript' : 'css'
  const ctx = `当前文件: ${props.fileName}\n页面ID: ${props.pageId}\n\n文件内容:\n\`\`\`${lang}\n${props.fileContent}\n\`\`\``
  
  if (fileType === 'json') {
    switch (action) {
      case 'fix':
        return `${ctx}\n\n请检查上述配置文件，找出并修复所有问题（语法错误、无效引用、缺失必要字段等）。只返回修复后的完整 JSON，不要解释。`
      case 'optimize':
        return `${ctx}\n\n请优化上述配置文件：\n1. 改进组件命名（使其更有意义）\n2. 优化布局结构（合理分组）\n3. 补充缺失的常用属性\n只返回优化后的完整 JSON，不要解释。`
      case 'complete':
        return `${ctx}\n\n请补全上述配置文件中缺失的必要字段（如 label、placeholder、rules 等常用属性）。只返回补全后的完整 JSON，不要解释。`
      case 'explain':
        return `${ctx}\n\n请用简洁的中文解释这个配置文件的结构和功能。分析每个主要组件的作用。`
    }
  } else if (fileType === 'js') {
    switch (action) {
      case 'fix':
        return `${ctx}\n\n请检查上述 SPARK 沙盒脚本，找出并修复所有问题（语法错误、未定义变量、API 调用错误等）。\n注意：沙盒中可用 $page, $route, $dataSet, $query, SparkData, h 等全局变量。\n只返回修复后的完整代码，不要解释。`
      case 'optimize':
        return `${ctx}\n\n请优化上述 SPARK 沙盒脚本：\n1. 简化冗余逻辑\n2. 使用更好的变量命名\n3. 添加必要的错误处理\n只返回优化后的完整代码，不要解释。`
      case 'complete':
        return `${ctx}\n\n请补全上述脚本中可能缺失的部分：\n1. 添加常用的事件处理函数\n2. 补充数据操作逻辑\n只返回补全后的完整代码，不要解释。`
      case 'explain':
        return `${ctx}\n\n请用简洁的中文解释这个沙盒脚本的功能和执行流程。`
    }
  } else {
    switch (action) {
      case 'fix':
        return `${ctx}\n\n请检查上述 CSS 样式，找出并修复所有问题（语法错误、无效属性等）。只返回修复后的完整 CSS，不要解释。`
      case 'optimize':
        return `${ctx}\n\n请优化上述 CSS 样式：\n1. 合并重复选择器\n2. 使用更简洁的写法\n3. 改善响应式设计\n只返回优化后的完整 CSS，不要解释。`
      case 'complete':
        return `${ctx}\n\n请补全上述 CSS 中可能缺失的常用样式（如 hover 状态、响应式断点等）。只返回补全后的完整 CSS，不要解释。`
      case 'explain':
        return `${ctx}\n\n请用简洁的中文解释这个样式文件的设计意图和主要选择器的作用。`
    }
  }
  return ctx
}

async function handleCommand(command: string) {
  if (!loop.value || !props.enabled) return
  
  loading.value = true
  currentAction.value = {
    fix: '修复中...',
    optimize: '优化中...',
    complete: '补全中...',
    explain: '分析中...',
  }[command] ?? 'AI 操作'
  
  try {
    const prompt = buildPrompt(command)
    
    if (command === 'explain') {
      // 解释模式：流式输出
      explanation.value = ''
      await loop.value.generateStream(props.pageId, prompt, {
        onDelta(text) { explanation.value += text },
        onReasoning() {},
        onPhase() {},
      })
    } else {
      // 修改模式：文件级回写优先，避免依赖 explanation 文本抽取
      const fileName = props.fileName as PageFileName
      const result = await runAiFileWriteback({
        loop: loop.value,
        pageId: props.pageId,
        prompt,
        targetFile: fileName,
        contextFiles: {
          [fileName]: props.fileContent,
        },
        callbacks: {
          onDelta() {},
          onReasoning() {},
          onPhase() {},
        },
      })

      const content = result.content
      if (content) {
        suggestedContent.value = content
        suggestion.value = `AI ${command === 'fix' ? '修复' : command === 'optimize' ? '优化' : '补全'}完成（${result.source}），点击"应用"覆盖当前内容`
      } else {
        emit('status', '未能获取有效的修改建议', 'warning')
      }
    }
  } catch (err) {
    emit('status', `AI 操作失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    loading.value = false
    currentAction.value = 'AI 操作'
  }
}

function applySuggestion() {
  if (suggestedContent.value) {
    emit('apply', suggestedContent.value)
    emit('status', '已应用 AI 建议', 'success')
  }
  dismissSuggestion()
}

function dismissSuggestion() {
  suggestion.value = ''
  suggestedContent.value = ''
}

function dismissExplanation() {
  explanation.value = ''
}
</script>

<style scoped>
.ai-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 14px;
  background: linear-gradient(135deg, #f5f0ff 0%, #f0f7ff 100%);
  border-bottom: 1px solid #e8e0f0;
  flex-wrap: wrap;
}

.ai-bar__left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-bar__label {
  font-size: 12px;
  color: #7c3aed;
  font-weight: 500;
}

.ai-bar__suggestion {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #d4c4f0;
}

.suggestion-text {
  flex: 1;
  font-size: 12px;
  color: #5b21b6;
}

.ai-bar__explanation {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #d4c4f0;
  max-height: 200px;
  overflow-y: auto;
}

.explanation-content {
  flex: 1;
  font-size: 13px;
  line-height: 1.6;
  color: #374151;
}

.explanation-content :deep(p) {
  margin: 0 0 8px;
}

.explanation-content :deep(p:last-child) {
  margin-bottom: 0;
}

.explanation-content :deep(code) {
  background: #f3f4f6;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}

.explanation-content :deep(ul),
.explanation-content :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}
</style>
