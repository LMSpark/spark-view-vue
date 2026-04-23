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

import AiChatWidget from '../src/components/AiChatWidget.vue'

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
})