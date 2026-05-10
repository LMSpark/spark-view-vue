import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('vue-markdown-render', () => ({
  default: defineComponent({
    name: 'VueMarkdownStub',
    props: {
      source: String,
    },
    setup(props) {
      return () => h('div', { class: 'markdown-stub' }, props.source ?? '')
    },
  }),
}))

import { AiChatWidget, AppAiPanel, useAiPanelStore } from '@spark-view/spark-component'

function resetAiPanelStore() {
  const store = useAiPanelStore()
  store.close()
  const current = store.getCurrentConfig()
  if (current) store.disposeIf(current)
}

describe('AiChatWidget persistence', () => {
  beforeEach(() => {
    resetAiPanelStore()
    localStorage.clear()
  })

  afterEach(() => {
    resetAiPanelStore()
  })

  it('switches to the latest sender without remounting and restores messages from storage', async () => {
    const senderA = vi.fn(async (request) => {
      request.onDelta?.('A-response')
    })
    const senderB = vi.fn(async (request) => {
      request.onDelta?.('B-response')
    })

    const wrapper = mount(AiChatWidget, {
      props: {
        title: 'Global AI',
        placeholder: 'global placeholder',
        sender: senderA,
        storageKey: 'ai-chat-widget-test',
      },
    })

    await wrapper.find('.chat-textarea').setValue('hello')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(senderA).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('hello')
    expect(wrapper.text()).toContain('A-response')

    await wrapper.setProps({
      sender: senderB,
      title: 'Global AI Updated',
      placeholder: 'updated placeholder',
    })

    await wrapper.find('.chat-textarea').setValue('world')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(senderB).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('B-response')
    expect(wrapper.find('.chat-title').text()).toBe('Global AI Updated')

    wrapper.unmount()

    const restored = mount(AiChatWidget, {
      props: {
        title: 'Restored AI',
        sender: senderB,
        storageKey: 'ai-chat-widget-test',
      },
    })

    await flushPromises()

    expect(restored.text()).toContain('hello')
    expect(restored.text()).toContain('A-response')
    expect(restored.text()).toContain('world')
    expect(restored.text()).toContain('B-response')
  })

  it('restores cached chat after the global AI panel closes and reopens', async () => {
    const store = useAiPanelStore()
    const sender = vi.fn(async (request) => {
      request.onDelta?.('重开后仍然可见')
    })
    const config = {
      storageKey: 'app-ai-panel-reopen-session',
      title: '页面模型级编辑',
      sender,
    }

    const wrapper = mount(AppAiPanel)
    await store.open(config)
    await flushPromises()

    await wrapper.find('.chat-textarea').setValue('你好')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('你好')
    expect(wrapper.text()).toContain('重开后仍然可见')

    store.close()
    await flushPromises()

    localStorage.removeItem('app-ai-panel-reopen-session')

    await store.open(config)
    await flushPromises()

    expect(wrapper.text()).toContain('你好')
    expect(wrapper.text()).toContain('重开后仍然可见')

    wrapper.unmount()
  })

  it('sanitizes interrupted streaming messages when restoring from storage', async () => {
    localStorage.setItem('ai-chat-widget-test', JSON.stringify([
      {
        id: 'u1',
        role: 'user',
        content: '删除最后修改人字段',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'a1',
        role: 'assistant',
        content: '已接收需求，正在执行 DataSet 模型级编辑...',
        timestamp: new Date().toISOString(),
        streaming: true,
      },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        streaming: true,
      },
    ]))

    const restored = mount(AiChatWidget, {
      props: {
        title: 'Restored AI',
        storageKey: 'ai-chat-widget-test',
      },
    })

    await flushPromises()

    expect(restored.text()).toContain('删除最后修改人字段')
    expect(restored.text()).toContain('已接收需求，正在执行 DataSet 模型级编辑...')
    expect(restored.text()).toContain('上一轮响应已中断，请重新发送继续。')
    expect(restored.find('.streaming-cursor').exists()).toBe(false)
    expect(restored.text()).not.toContain('思考中...')
  })

  it('allows typing the next prompt while streaming but does not send concurrently', async () => {
    let release!: () => void
    const sender = vi.fn(async (request) => {
      request.onDelta?.('处理中...')
      await new Promise<void>((resolve) => {
        release = resolve
      })
      request.onDelta?.('完成')
    })

    const wrapper = mount(AiChatWidget, {
      props: {
        sender,
        storageKey: 'ai-chat-widget-streaming-input',
      },
    })

    const textarea = wrapper.find('.chat-textarea')
    await textarea.setValue('第一条')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(sender).toHaveBeenCalledTimes(1)
    expect(textarea.attributes('disabled')).toBeUndefined()
    expect(textarea.attributes('placeholder')).toContain('AI 编辑中')

    await new Promise((resolve) => window.setTimeout(resolve, 20))
    expect(wrapper.text()).toContain('处理中')

    await textarea.setValue('第二条')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('第二条')

    await textarea.trigger('keydown.enter')
    await flushPromises()
    expect(sender).toHaveBeenCalledTimes(1)

    release()
    await flushPromises()

    expect((wrapper.find('.chat-textarea').element as HTMLTextAreaElement).value).toBe('第二条')
  })

  it('runs configured turns concurrently with isolated base history snapshots', async () => {
    const releases = new Map<string, () => void>()
    const sender = vi.fn(async (request) => {
      const prompt = request.historyMsgs.at(-1)?.content ?? ''
      request.onDelta?.(`开始:${prompt};`)
      await new Promise<void>((resolve) => {
        releases.set(prompt, resolve)
      })
      request.onDelta?.(`结束:${prompt};`)
    })

    const wrapper = mount(AiChatWidget, {
      props: {
        sender,
        storageKey: 'ai-chat-widget-concurrent-turns',
        turnConcurrency: { maxParallelTurns: 2 },
      },
    })

    const textarea = wrapper.find('.chat-textarea')
    await textarea.setValue('第一条')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(sender).toHaveBeenCalledTimes(1)
    expect(sender.mock.calls[0]?.[0].turn).toMatchObject({ seq: 1, baseRevision: 0, maxParallelTurns: 2 })

    await textarea.setValue('第二条')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(sender).toHaveBeenCalledTimes(2)
    expect(sender.mock.calls[1]?.[0].turn).toMatchObject({ seq: 2, baseRevision: 0, maxParallelTurns: 2 })
    expect(sender.mock.calls[1]?.[0].historyMsgs.map((msg: { content: string }) => msg.content)).toEqual(['第二条'])
    expect(wrapper.text()).toContain('第一条')
    expect(wrapper.text()).toContain('第二条')
    expect(wrapper.text()).toContain('并行 2/2')

    releases.get('第二条')?.()
    await flushPromises()
    await new Promise((resolve) => window.setTimeout(resolve, 20))

    expect(wrapper.text()).toContain('结束:第二条')
    expect(sender).toHaveBeenCalledTimes(2)

    releases.get('第一条')?.()
    await flushPromises()
    await new Promise((resolve) => window.setTimeout(resolve, 20))

    expect(wrapper.text()).toContain('结束:第一条')
  })

  it('queues overflow turns when configured and starts them after a slot frees', async () => {
    const releases = new Map<string, () => void>()
    const sender = vi.fn(async (request) => {
      const prompt = request.historyMsgs.at(-1)?.content ?? ''
      request.onDelta?.(`运行:${prompt};`)
      await new Promise<void>((resolve) => {
        releases.set(prompt, resolve)
      })
      request.onDelta?.(`完成:${prompt};`)
    })

    const wrapper = mount(AiChatWidget, {
      props: {
        sender,
        storageKey: 'ai-chat-widget-queued-turns',
        turnConcurrency: { maxParallelTurns: 1, overflow: 'queue' },
      },
    })

    const textarea = wrapper.find('.chat-textarea')
    await textarea.setValue('第一条')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    await textarea.setValue('第二条')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(sender).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('AI 排队中')
    expect(wrapper.text()).toContain('队列 1')

    releases.get('第一条')?.()
    await flushPromises()
    await new Promise((resolve) => window.setTimeout(resolve, 20))

    expect(sender).toHaveBeenCalledTimes(2)
    expect(sender.mock.calls[1]?.[0].historyMsgs.map((msg: { content: string }) => msg.content)).toEqual(['第二条'])
    expect(sender.mock.calls[1]?.[0].turn).toMatchObject({ seq: 2, baseRevision: 0, maxParallelTurns: 1 })

    releases.get('第二条')?.()
    await flushPromises()
    await new Promise((resolve) => window.setTimeout(resolve, 20))

    expect(wrapper.text()).toContain('完成:第二条')
  })

  it('passes selected recovery and collaboration policies to the sender', async () => {
    const sender = vi.fn(async (request) => {
      request.onDelta?.('ok')
    })

    const wrapper = mount(AiChatWidget, {
      props: {
        sender,
        storageKey: 'ai-chat-widget-policy-request',
        showToolLogs: true,
      },
    })

    const strictButton = wrapper.findAll('.policy-btn').find((button) => button.text() === '严格')
    const autoButton = wrapper.findAll('.policy-btn').find((button) => button.text() === '自动')
    expect(strictButton).toBeDefined()
    expect(autoButton).toBeDefined()
    await strictButton!.trigger('click')
    await autoButton!.trigger('click')
    await wrapper.find('.chat-textarea').setValue('继续构建')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(sender).toHaveBeenCalledTimes(1)
    expect(sender.mock.calls[0]?.[0].policies).toEqual({
      recovery: 'strict',
      collaboration: 'auto',
    })
  })

  it('fills draft action output into input without sending', async () => {
    const sender = vi.fn(async (request) => {
      request.onDelta?.('sent')
    })
    const builder = vi.fn(async () => '[页面文本]\n按钮 A')

    const wrapper = mount(AiChatWidget, {
      props: {
        sender,
        storageKey: 'ai-chat-widget-draft-action-fill',
        draftActions: [{
          id: 'preview-page-text',
          label: '发送页面文本',
          prefix: '请分析页面文本',
          builder,
        }],
      },
    })

    await wrapper.find('.draft-action-btn').trigger('click')
    await flushPromises()

    const textarea = wrapper.find('.chat-textarea').element as HTMLTextAreaElement
    expect(builder).toHaveBeenCalledTimes(1)
    expect(textarea.value).toContain('请分析页面文本')
    expect(textarea.value).toContain('[页面文本]')
    expect(sender).not.toHaveBeenCalled()
  })

  it('logs draft action failures without polluting input', async () => {
    const sender = vi.fn(async (request) => {
      request.onDelta?.('sent')
    })
    const builder = vi.fn(async () => {
      throw new Error('PREVIEW_NOT_READY')
    })

    const wrapper = mount(AiChatWidget, {
      props: {
        sender,
        storageKey: 'ai-chat-widget-draft-action-failed',
        showToolLogs: true,
        draftActions: [{
          id: 'preview-page-text',
          label: '发送页面文本',
          builder,
        }],
      },
    })

    await wrapper.find('.draft-action-btn').trigger('click')
    await flushPromises()

    const textarea = wrapper.find('.chat-textarea').element as HTMLTextAreaElement
    expect(textarea.value).toBe('')
    expect(wrapper.text()).toContain('发送页面文本: PREVIEW_NOT_READY')
    expect(sender).not.toHaveBeenCalled()
  })

  it('renders SSE diagnostics and opens FC call details', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const sender = vi.fn(async (request) => {
      request.onSseEvent?.({ sessionId: 'session-1', type: 'done', data: '{}' })
      request.onSseEvent?.({ sessionId: 'session-1', type: 'reasoning', data: 'reasoning-context ' })
      request.onSseEvent?.({ sessionId: 'session-1', type: 'reasoning', data: 'more-reasoning ' })
      request.onSseEvent?.({ sessionId: 'session-1', type: 'delta', data: 'raw-sse-' })
      request.onSseEvent?.({ sessionId: 'session-1', type: 'delta', data: 'delta' })
      request.onFcCall?.({
        toolName: 'pageDesign/knowledge/queryPayloads',
        args: { category: 'layout' },
        round: 2,
        callId: 'call-1',
        status: 'success',
        result: { count: 3 },
        durationMs: 12,
      })
      request.onDelta?.('done')
    })

    const wrapper = mount(AiChatWidget, {
      props: {
        sender,
        storageKey: 'ai-chat-widget-diagnostics',
        pageId: 'orders-page',
        showToolLogs: true,
        externalToolLogs: [
          { type: 'info', tag: 'session-ready', text: '编辑会话已挂接到当前页面模型；后续读写仅通过 FC 工具执行', timestamp: '2026-04-27T13:03:35.000Z' },
          { type: 'info', tag: '人工输入', text: '诊断一下', timestamp: '2026-04-27T13:03:36.000Z' },
          { type: 'info', tag: 'LLM → pageDesign/lifecycle/describeProgress', text: '读取会话状态', timestamp: '2026-04-27T13:03:36.500Z' },
          { type: 'info', tag: 'SSE delta', text: 'duplicated-sse-log', timestamp: '2026-04-27T13:03:37.000Z' },
          { type: 'success', tag: 'SSE result', text: 'duplicated-result-log', timestamp: '2026-04-27T13:03:38.000Z' },
        ],
      },
    })

    await wrapper.find('.chat-textarea').setValue('诊断一下')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('人工输入')
    expect(wrapper.text()).toContain('诊断一下')
    const humanEntry = wrapper.findAll('.diagnostic-entry--message')
      .find((entry) => entry.find('.diagnostic-entry__kind').text() === '人工输入')
    expect(humanEntry?.find('.diagnostic-entry__title').text()).toBe('用户消息')
    expect(wrapper.findAll('.diagnostic-entry__title').filter((entry) => entry.text() === '人工输入')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('SSE 文本增量')
    expect(wrapper.text()).not.toContain('SSE 推理')
    expect(wrapper.text()).not.toContain('raw-sse-delta')
    expect(wrapper.text()).not.toContain('duplicated-sse-log')
    expect(wrapper.text()).not.toContain('duplicated-result-log')
    expect(wrapper.text()).not.toContain('编辑会话已挂接到当前页面模型')
    expect(wrapper.text()).not.toContain('读取会话状态')
    expect(wrapper.text()).not.toContain('SSE done')
    expect(wrapper.text()).not.toContain('(empty)')
    const sseTextEntries = wrapper.findAll('.diagnostic-entry--sse-text')
    expect(sseTextEntries).toHaveLength(0)
    expect(wrapper.text()).toContain('FC 调用记录 (1)')
    expect(wrapper.text()).toContain('参数荷载目录')

    await wrapper.find('button[title="复制结构化诊断数据"]').trigger('click')

    expect(writeText).toHaveBeenCalledTimes(1)
    const structured = JSON.parse(writeText.mock.calls[0]?.[0] as string) as {
      pageId: string
      counts: { humanInputs: number; fcCalls: number; sseEvents: number; sseTextSegments: number; toolLogs: number }
      timeline: Array<{ source: string; kind: string; payload: string; title: string }>
      toolLogs: Array<{ tag: string; title: string; text: string }>
      sseEvents: Array<{ type: string; data: string; sessionId?: string }>
      fcCalls: Array<{ toolName: string; status: string }>
    }
    expect(structured.pageId).toBe('orders-page')
    expect(structured.counts.humanInputs).toBe(1)
    expect(structured.counts.fcCalls).toBe(1)
    expect(structured.counts.sseEvents).toBe(4)
    expect(structured.counts.sseTextSegments).toBe(2)
    expect(structured.counts.toolLogs).toBe(2)
    expect(structured.toolLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: 'session-ready', title: '会话就绪', text: expect.stringContaining('编辑会话已挂接') }),
      expect.objectContaining({ tag: 'LLM → pageDesign/lifecycle/describeProgress', title: 'LLM → pageDesign/lifecycle/describeProgress', text: '读取会话状态' }),
    ]))
    expect(structured.sseEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'reasoning', data: 'reasoning-context ', sessionId: 'session-1' }),
      expect.objectContaining({ type: 'reasoning', data: 'more-reasoning ', sessionId: 'session-1' }),
      expect.objectContaining({ type: 'delta', data: 'raw-sse-', sessionId: 'session-1' }),
      expect.objectContaining({ type: 'delta', data: 'delta', sessionId: 'session-1' }),
    ]))
    expect(structured.timeline.filter((item) => item.source === 'human' && item.payload.includes('诊断一下'))).toHaveLength(1)
    expect(structured.timeline.some((item) => item.source === 'tool-log' && item.title === '人工输入')).toBe(false)
    expect(structured.timeline.some((item) => item.source === 'tool-log' && item.title.startsWith('SSE '))).toBe(false)
    expect(structured.timeline.some((item) => item.kind === 'sse' && item.payload.trim() === '')).toBe(false)
    expect(structured.timeline.some((item) => item.title === 'SSE done')).toBe(false)
    expect(structured.fcCalls[0]).toMatchObject({ toolName: 'pageDesign/knowledge/queryPayloads', status: 'success' })

    await wrapper.find('.fc-call-entry').trigger('click')

    expect(wrapper.text()).toContain('参数')
    expect(wrapper.text()).toContain('原始工具 pageDesign/knowledge/queryPayloads')
    expect(wrapper.text()).toContain('"category": "layout"')
    expect(wrapper.text()).toContain('"count": 3')
  })

  it('batches SSE cache writes and persists the final structured snapshot', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    const sender = vi.fn(async (request) => {
      for (let index = 0; index < 20; index += 1) {
        request.onSseEvent?.({ sessionId: 'session-batch', type: 'delta', data: `sse-${index};` })
        request.onDelta?.(`delta-${index};`)
      }
      request.onSseEvent?.({ sessionId: 'session-batch', type: 'done', data: '{}' })
      request.onFcCall?.({
        toolName: 'pageDesign/knowledge/queryPayloads',
        args: { type: 'r-table' },
        round: 1,
        status: 'success',
        result: { ok: true },
      })
    })

    const wrapper = mount(AiChatWidget, {
      props: {
        sender,
        storageKey: 'ai-chat-widget-sse-cache-batch',
      },
    })

    await wrapper.find('.chat-textarea').setValue('压测 SSE')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    const currentSessionWrites = setItemSpy.mock.calls.filter(([key]) => key === 'ai-chat-widget-sse-cache-batch')
    expect(currentSessionWrites).toHaveLength(1)
    const raw = localStorage.getItem('ai-chat-widget-sse-cache-batch')
    expect(raw).not.toBeNull()
    const snapshot = JSON.parse(raw ?? '{}') as {
      messages?: Array<{ content: string }>
      sseEvents?: Array<{ type: string; data: string }>
      fcCalls?: Array<{ toolName: string }>
    }
    expect(snapshot.messages?.at(-1)?.content).toContain('delta-19')
    expect(snapshot.sseEvents).toHaveLength(20)
    expect(snapshot.sseEvents?.some((event) => event.type === 'done' && event.data === '')).toBe(false)
    expect(snapshot.fcCalls).toHaveLength(1)
    expect(snapshot.fcCalls?.[0]?.toolName).toBe('pageDesign/knowledge/queryPayloads')

    setItemSpy.mockRestore()
  })

  it('renders pageDesign/knowledge/ask as clickable clarification answers', async () => {
    let callCount = 0
    const sender = vi.fn(async (request) => {
      callCount += 1
      if (callCount === 1) {
        request.onFcCall?.({
          toolName: 'pageDesign/knowledge/ask',
          args: {},
          round: 1,
          callId: 'ask-1',
          status: 'success',
          result: {
            title: '确认订单范围',
            reason: '缺少订单页面的业务覆盖范围。',
            questions: [
              {
                id: 'order-scope',
                prompt: '订单管理页面本次应覆盖哪个业务范围？',
                type: 'single',
                options: [
                  { id: 'basic', label: '基础订单列表', value: 'basic' },
                  { id: 'workflow', label: '订单处理流程', value: 'workflow', description: '包含接单、发货、完成动作' },
                ],
                recommendedOptionIds: ['workflow'],
              },
            ],
          },
        })
        return
      }
      request.onDelta?.('收到反问回答')
    })

    const wrapper = mount(AiChatWidget, {
      props: {
        sender,
        storageKey: 'ai-chat-widget-clarification',
        showToolLogs: true,
      },
    })

    await wrapper.find('.chat-textarea').setValue('做订单管理')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('确认订单范围')
    expect(wrapper.text()).toContain('基础订单列表')
    expect(wrapper.text()).toContain('订单处理流程')
    expect(wrapper.text()).toContain('推荐')

    await wrapper.find('.clarification-recommend-btn').trigger('click')
    await flushPromises()

    expect(sender).toHaveBeenCalledTimes(2)
    expect(sender.mock.calls[1]?.[0].historyMsgs.at(-1)?.content).toContain('【反问回答】确认订单范围')
    expect(sender.mock.calls[1]?.[0].historyMsgs.at(-1)?.content).toContain('订单处理流程')
    expect(sender.mock.calls[1]?.[0].historyMsgs.at(-1)?.content).toContain('workflow')
    expect(wrapper.text()).toContain('已回答')
  })

  it('reports failed FC calls and shows report status', async () => {
    const reportFcError = vi.fn(async (_record: unknown) => ({ reportId: 'report-1', serverTimestamp: 1777250000000 }))
    const sender = vi.fn(async (request) => {
      request.onFcCall?.({
        toolName: 'pageDesign/knowledge/queryPayloads',
        args: { category: 'bad' },
        round: 1,
        callId: 'call-error-1',
        status: 'error',
        error: 'INVALID_CATEGORY',
        result: { ok: false, code: 'INVALID_CATEGORY' },
      })
    })

    const wrapper = mount(AiChatWidget, {
      props: {
        sender,
        reportFcError,
        storageKey: 'ai-chat-widget-fc-error-report',
        showToolLogs: true,
      },
    })

    await wrapper.find('.chat-textarea').setValue('触发错误')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()
    await flushPromises()

    expect(reportFcError).toHaveBeenCalledTimes(1)
    expect(reportFcError.mock.calls[0]?.[0]).toMatchObject({
      toolName: 'pageDesign/knowledge/queryPayloads',
      status: 'error',
      error: 'INVALID_CATEGORY',
    })
    expect(wrapper.text()).toContain('FC 调用记录 (1)')
    expect(wrapper.text()).toContain('错误 1')
    expect(wrapper.text()).toContain('已回传')

    await wrapper.find('.fc-call-entry').trigger('click')

    expect(wrapper.text()).toContain('report-1')
  })
})
