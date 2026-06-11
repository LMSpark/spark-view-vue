<!--
@module @spark-appworks/spark-component:ai/components/AiSessionTracePanel
@spark-appworks/spark-component 的 ai/components/AiSessionTracePanel 模块。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <el-scrollbar :class="$style['trace-panel']" :style="{ height }">
    <div v-if="isEmpty" :class="$style['trace-panel__empty']">
      <el-empty :description="emptyText" />
    </div>
    <el-row v-else :class="$style['trace-panel__body']" :gutter="16">
      <el-col :span="16">
        <SessionStreamView
          :entries="entries"
          :is-streaming="isStreaming"
          :is-reasoning="isReasoning"
          :empty-text="emptyText"
        />
      </el-col>
      <el-col :span="8">
        <SessionDiagnosticsPanel :data="diagnostics" />
      </el-col>
    </el-row>
  </el-scrollbar>
</template>

<script setup lang="ts">
/**
 * AI 会话监视根面板。
 * 左侧流式消息视图 + 右侧诊断面板。
 */
import { computed } from 'vue'
import SessionStreamView from './SessionStreamView.vue'
import SessionDiagnosticsPanel from './SessionDiagnosticsPanel.vue'
import type { AiSessionTracePanelProps } from './AiSessionTracePanel.props'

const props = withDefaults(defineProps<AiSessionTracePanelProps>(), {
  height: '100%',
  emptyText: '暂无 AI 会话数据',
})

const isEmpty = computed(() =>
  props.entries.length === 0 && !hasDiagnostics(props.diagnostics),
)

function hasDiagnostics(data: AiSessionTracePanelProps['diagnostics']): boolean {
  const summary = data.summary
  return (
    summary.status !== null
    || summary.historyCount > 0
    || summary.messageCount > 0
    || summary.toolCallCount > 0
    || summary.failedToolCallCount > 0
    || summary.functionNames.length > 0
    || summary.lastAssistantText.length > 0
    || data.transcript.length > 0
    || data.issues.length > 0
  )
}
</script>

<style module>
.trace-panel {
  height: 100%;
}

.trace-panel__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.trace-panel__body {
  padding: 16px;
  height: 100%;
}
</style>
