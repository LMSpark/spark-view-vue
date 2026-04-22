import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { DevState } from '../src/views/app/dev-system/useDevState'

const shared = vi.hoisted(() => ({
  host: {
    resetSync: vi.fn(),
  },
  createHost: vi.fn(),
  ruleReset: vi.fn(),
  ruleSessionOptions: [] as Array<Record<string, unknown>>,
  aiWidgetMountCount: { value: 0 },
}))

shared.createHost.mockImplementation(() => shared.host)

vi.mock('@/components/AiChatWidget.vue', () => ({
  default: defineComponent({
    name: 'AiChatWidgetStub',
    props: {
      title: String,
      placeholder: String,
      storageKey: String,
    },
    setup(props) {
      shared.aiWidgetMountCount.value += 1
      return () => h('div', {
        class: 'ai-chat-widget-stub',
        'data-title': props.title,
        'data-placeholder': props.placeholder,
        'data-storage-key': props.storageKey,
      }, props.title ?? '')
    },
  }),
}))

vi.mock('@/components/NavIcon.vue', () => ({
  default: defineComponent({
    name: 'NavIconStub',
    setup() {
      return () => h('i', { class: 'nav-icon-stub' })
    },
  }),
}))

vi.mock('../src/views/app/dev-system/composables/usePageModelSessionHost', () => ({
  usePageModelSessionHost: shared.createHost,
}))

vi.mock('../src/views/app/dev-system/composables/useRuleEditSession', () => ({
  useRuleEditSession: (options: Record<string, unknown>) => {
    shared.ruleSessionOptions.push(options)
    return {
      reset: shared.ruleReset,
      runLlm: vi.fn(async () => {}),
      log: { value: [] },
    }
  },
}))

import DevFloatingAiPanel from '../src/views/app/dev-system/components/DevFloatingAiPanel.vue'

const TooltipStub = defineComponent({
  name: 'TooltipStub',
  setup(_, { slots }) {
    return () => h('div', { class: 'tooltip-stub' }, slots['default']?.())
  },
})

const AlertStub = defineComponent({
  name: 'AlertStub',
  props: {
    title: String,
  },
  setup(props, { slots }) {
    return () => h('div', { class: 'alert-stub' }, [props.title ?? '', slots['default']?.()])
  },
})

describe('DevFloatingAiPanel shared session host', () => {
  beforeEach(() => {
    shared.createHost.mockClear()
    shared.host.resetSync.mockClear()
    shared.ruleReset.mockClear()
    shared.ruleSessionOptions.length = 0
    shared.aiWidgetMountCount.value = 0
    localStorage.clear()
  })

  it('shares one session host, ignores active-file-only changes, and restores chat state by page-scoped key', async () => {
    const activePageId = ref('orders-page')
    const state = {
      activePageId,
      pageDataDesignerDirty: ref(false),
      createLiveEditModelAdapter: vi.fn(() => ({
        getNodeTree: vi.fn(() => null),
        getDataSetTool: vi.fn(() => null),
        readScript: vi.fn(() => ''),
        writeScript: vi.fn(),
        readStyle: vi.fn(() => ''),
        writeStyle: vi.fn(),
      })),
      addStatus: vi.fn(),
      canPageEditTransactionBack: vi.fn(() => false),
      canPageEditTransactionForward: vi.fn(() => false),
      undoPageEditTransaction: vi.fn(),
      redoPageEditTransaction: vi.fn(),
      getPageEditTransactionCount: vi.fn(() => 0),
      ensureActivePageFilesLoaded: vi.fn(async () => {}),
      loadPageFile: vi.fn(async () => {}),
    } as unknown as DevState

    const wrapper = mount(DevFloatingAiPanel, {
      props: {
        state,
        activeFile: 'rule.json',
      },
      global: {
        stubs: {
          'el-tooltip': TooltipStub,
          'el-alert': AlertStub,
        },
      },
    })

    expect(shared.createHost).toHaveBeenCalledTimes(1)
    expect(typeof shared.createHost.mock.calls[0]?.[0]?.getSessionKey).toBe('function')
    expect(typeof shared.createHost.mock.calls[0]?.[0]?.getLiveModelAdapter).toBe('function')
    expect(shared.createHost.mock.calls[0]?.[0]?.getContextModel).toBeUndefined()
    expect(shared.ruleSessionOptions[0]?.['sessionHost']).toBe(shared.host)
    expect(typeof shared.ruleSessionOptions[0]?.['getSessionKey']).toBe('function')
    expect(typeof shared.ruleSessionOptions[0]?.['getLiveModelAdapter']).toBe('function')
    expect(shared.ruleSessionOptions[0]?.['getContextModel']).toBeUndefined()
    expect(shared.aiWidgetMountCount.value).toBe(1)
    expect(wrapper.find('.ai-chat-widget-stub').attributes('data-storage-key')).toBe('devsystem-ai-chat:orders-page')

    await wrapper.setProps({ activeFile: 'script.js' })
    await nextTick()

    expect(shared.ruleReset).not.toHaveBeenCalled()
    expect(shared.host.resetSync).not.toHaveBeenCalled()
    expect(shared.aiWidgetMountCount.value).toBe(1)

    localStorage.setItem('devsystem-ai-chat:orders-page', JSON.stringify([{ id: 'm1', role: 'user', content: 'cached-page-1', timestamp: new Date().toISOString() }]))
    localStorage.setItem('devsystem-ai-chat:orders-page-v2', JSON.stringify([{ id: 'm2', role: 'assistant', content: 'cached-page-2', timestamp: new Date().toISOString() }]))

    activePageId.value = 'orders-page-v2'
    await nextTick()

    expect(localStorage.getItem('devsystem-ai-chat:orders-page')).toContain('cached-page-1')
    expect(localStorage.getItem('devsystem-ai-chat:orders-page-v2')).toContain('cached-page-2')
    expect(shared.host.resetSync).toHaveBeenCalledTimes(1)
    expect(shared.ruleReset).toHaveBeenCalledTimes(1)
    expect(shared.aiWidgetMountCount.value).toBe(2)
    expect(wrapper.find('.ai-chat-widget-stub').attributes('data-storage-key')).toBe('devsystem-ai-chat:orders-page-v2')

    activePageId.value = 'orders-page'
    await nextTick()

    expect(shared.host.resetSync).toHaveBeenCalledTimes(2)
    expect(shared.ruleReset).toHaveBeenCalledTimes(2)
    expect(shared.aiWidgetMountCount.value).toBe(3)
    expect(wrapper.find('.ai-chat-widget-stub').attributes('data-storage-key')).toBe('devsystem-ai-chat:orders-page')
    expect(localStorage.getItem('devsystem-ai-chat:orders-page')).toContain('cached-page-1')
  })
})