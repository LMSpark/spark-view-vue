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
})