import { beforeEach, describe, expect, it, vi } from 'vitest'
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

import { AiChatWidget } from '@spark-view/spark-component'

describe('AiChatWidget persistence', () => {
  beforeEach(() => {
    localStorage.clear()
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

    await textarea.setValue('第二条')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('第二条')

    await textarea.trigger('keydown.enter')
    await flushPromises()
    expect(sender).toHaveBeenCalledTimes(1)

    release()
    await flushPromises()

    expect((wrapper.find('.chat-textarea').element as HTMLTextAreaElement).value).toBe('第二条')
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

  it('renders SSE diagnostics and opens FC call details', async () => {
    const sender = vi.fn(async (request) => {
      request.onSseEvent?.({ sessionId: 'session-1', type: 'reasoning', data: 'reasoning-context ' })
      request.onSseEvent?.({ sessionId: 'session-1', type: 'reasoning', data: 'more-reasoning ' })
      request.onSseEvent?.({ sessionId: 'session-1', type: 'delta', data: 'raw-sse-' })
      request.onSseEvent?.({ sessionId: 'session-1', type: 'delta', data: 'delta' })
      request.onFcCall?.({
        toolName: 'catalog.query',
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
      },
    })

    await wrapper.find('.chat-textarea').setValue('诊断一下')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('SSE 文本增量')
    expect(wrapper.text()).toContain('SSE 推理')
    expect(wrapper.text()).toContain('raw-sse-delta')
    const sseTextEntries = wrapper.findAll('.diagnostic-entry--sse-text')
    expect(sseTextEntries).toHaveLength(2)
    expect(sseTextEntries.every((entry) => entry.element.tagName.toLowerCase() === 'article')).toBe(true)
    expect(sseTextEntries[0]?.text()).toContain('SSE 推理 (2片)')
    expect(sseTextEntries[0]?.text()).toContain('页面=orders-page · 会话=session-1')
    expect(sseTextEntries[0]?.find('.diagnostic-entry__payload').text()).toContain('reasoning-context more-reasoning')
    expect(sseTextEntries[1]?.text()).toContain('SSE 文本增量 (2片)')
    expect(sseTextEntries[1]?.text()).toContain('页面=orders-page · 会话=session-1')
    expect(sseTextEntries[1]?.find('.diagnostic-entry__payload').text()).toContain('raw-sse-delta')
    expect(wrapper.text()).toContain('FC 调用记录 (1)')
    expect(wrapper.text()).toContain('组件目录')

    await wrapper.find('.fc-call-entry').trigger('click')

    expect(wrapper.text()).toContain('参数')
    expect(wrapper.text()).toContain('原始工具 catalog.query')
    expect(wrapper.text()).toContain('"category": "layout"')
    expect(wrapper.text()).toContain('"count": 3')
  })

  it('renders interaction.ask as clickable clarification answers', async () => {
    let callCount = 0
    const sender = vi.fn(async (request) => {
      callCount += 1
      if (callCount === 1) {
        request.onFcCall?.({
          toolName: 'interaction.ask',
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
        toolName: 'catalog.query',
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
      toolName: 'catalog.query',
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