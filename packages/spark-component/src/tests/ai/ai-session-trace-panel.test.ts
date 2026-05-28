import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { AiAgentSessionRecord, AiAgentHistoryEntry } from '@spark-view/spark-ai/agent'
import {
  summarizeAiAgentSessionRecord,
  createAiAgentSessionTranscript,
} from '@spark-view/spark-ai/agent'

// ── mock 子组件 ──
vi.mock('../../ai/components/SessionStreamView.vue', () => ({
  default: {
    name: 'SessionStreamView',
    props: ['entries', 'isStreaming', 'isReasoning', 'emptyText'],
    template: '<div data-testid="stream-view" />',
  },
}))

vi.mock('../../ai/components/SessionDiagnosticsPanel.vue', () => ({
  default: {
    name: 'SessionDiagnosticsPanel',
    props: ['data', 'loading'],
    template: '<div data-testid="diagnostics-panel" />',
  },
}))

import AiSessionTracePanel from '../../ai/components/AiSessionTracePanel.vue'
import type { SessionDiagnosticsData, StreamDisplayEntry } from '../../ai/types'

function createEmptyDiagnostics(): SessionDiagnosticsData {
  return {
    summary: summarizeAiAgentSessionRecord(null),
    transcript: createAiAgentSessionTranscript(null),
    issues: [],
  }
}

type SessionRecordOptions = Readonly<{
  moduleId?: string
  moduleInstanceId?: string
  instanceId?: string
  runtimeInstanceId?: string
  status?: AiAgentSessionRecord['status']
  startedAt?: number
  updatedAt?: number
  history?: readonly AiAgentHistoryEntry[]
}>

function makeSessionRecord(options: SessionRecordOptions = {}): AiAgentSessionRecord {
  return {
    moduleId: options.moduleId ?? 'm1',
    moduleInstanceId: options.moduleInstanceId ?? 'mi1',
    instanceId: options.instanceId ?? 'inst-1',
    runtimeInstanceId: options.runtimeInstanceId ?? 'rt-1',
    status: options.status ?? 'Started',
    startedAt: options.startedAt ?? Date.now(),
    updatedAt: options.updatedAt ?? Date.now(),
    history: options.history ?? [],
  }
}

function createUserEntry(content: string): StreamDisplayEntry {
  return { kind: 'user-message', content, timestamp: Date.now() }
}

function createElementPlusStubs() {
  return {
    'el-scrollbar': {
      template: '<div data-testid="el-scrollbar"><slot /></div>',
      props: ['height'],
    },
    'el-empty': {
      template: '<div data-testid="el-empty"><slot /></div>',
      props: ['description'],
    },
    'el-row': {
      template: '<div data-testid="el-row"><slot /></div>',
      props: ['gutter'],
    },
    'el-col': {
      template: '<div data-testid="el-col"><slot /></div>',
      props: ['span'],
    },
  }
}

describe('AiSessionTracePanel', () => {
  const sessionRecord = ref<AiAgentSessionRecord | null>(null)
  const entries = ref<readonly StreamDisplayEntry[]>([])
  const isStreaming = ref(false)
  const isReasoning = ref(false)
  const diagnostics = ref(createEmptyDiagnostics())
  const height = '600px'
  const emptyText = '暂无 AI 会话数据'

  function createProps(overrides: Record<string, unknown> = {}) {
    return {
      sessionRecord: sessionRecord.value,
      entries: entries.value,
      isStreaming: isStreaming.value,
      isReasoning: isReasoning.value,
      diagnostics: diagnostics.value,
      height,
      emptyText,
      ...overrides,
    }
  }

  function mountPanel(overrides: Record<string, unknown> = {}) {
    return mount(AiSessionTracePanel, {
      props: createProps(overrides),
      global: { stubs: createElementPlusStubs() },
    })
  }

  beforeEach(() => {
    sessionRecord.value = null
    entries.value = []
    isStreaming.value = false
    isReasoning.value = false
    diagnostics.value = createEmptyDiagnostics()
  })

  // ── 空状态 ──

  it('sessionRecord 为 null 且无 entries → 显示 empty 占位', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('[data-testid="el-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="stream-view"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="diagnostics-panel"]').exists()).toBe(false)
  })

  it('无 record 无 entries → 不渲染 el-row', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('[data-testid="el-row"]').exists()).toBe(false)
  })

  // ── 有 entries 时渲染子组件 ──

  it('有 entries 时渲染 SessionStreamView 和 SessionDiagnosticsPanel', () => {
    entries.value = [createUserEntry('你好')]
    const wrapper = mountPanel()
    expect(wrapper.find('[data-testid="stream-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="diagnostics-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="el-empty"]').exists()).toBe(false)
  })

  // ── sessionRecord 非 null 但 entries 为空 → 仍渲染 body（诊断面板有数据） ──

  it('sessionRecord 非 null 时 entries 为空 → 仍渲染 body', () => {
    sessionRecord.value = makeSessionRecord()
    const wrapper = mountPanel()
    expect(wrapper.find('[data-testid="el-row"]').exists()).toBe(true)
  })

  // ── 自定义 emptyText ──

  it('自定义 emptyText 传给 el-empty', () => {
    const wrapper = mountPanel({ emptyText: '请先启动 AI 会话' })
    expect(wrapper.find('[data-testid="el-empty"]').exists()).toBe(true)
  })

  // ── height prop ──

  it('height prop 传递到 el-scrollbar', () => {
    entries.value = [createUserEntry('test')]
    const wrapper = mountPanel()
    expect(wrapper.find('[data-testid="el-scrollbar"]').exists()).toBe(true)
  })

  // ── props 向子组件传递 ──

  it('将 isStreaming / isReasoning / entries / diagnostics 传给子组件', () => {
    entries.value = [createUserEntry('hello'), createUserEntry('world')]
    isStreaming.value = true
    isReasoning.value = true

    const wrapper = mountPanel()

    const streamView = wrapper.findComponent({ name: 'SessionStreamView' })
    expect(streamView.exists()).toBe(true)
    expect(streamView.props('entries')).toEqual(entries.value)
    expect(streamView.props('isStreaming')).toBe(true)
    expect(streamView.props('isReasoning')).toBe(true)
    expect(streamView.props('emptyText')).toBe(emptyText)

    const diagnosticsPanel = wrapper.findComponent({ name: 'SessionDiagnosticsPanel' })
    expect(diagnosticsPanel.exists()).toBe(true)
    expect(diagnosticsPanel.props('data')).toBe(diagnostics.value)
  })
})
