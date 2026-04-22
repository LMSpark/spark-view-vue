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
  pageDataReset: vi.fn(),
  ruleSessionOptions: [] as Array<Record<string, unknown>>,
  pageDataSessionOptions: [] as Array<Record<string, unknown>>,
  aiWidgetMountCount: { value: 0 },
}))

shared.createHost.mockImplementation(() => shared.host)

vi.mock('@/components/AiChatWidget.vue', () => ({
  default: defineComponent({
    name: 'AiChatWidgetStub',
    props: {
      title: String,
      placeholder: String,
    },
    setup(props) {
      shared.aiWidgetMountCount.value += 1
      return () => h('div', {
        class: 'ai-chat-widget-stub',
        'data-title': props.title,
        'data-placeholder': props.placeholder,
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

vi.mock('../src/views/app/dev-system/composables/usePageDataEditSession', () => ({
  usePageDataEditSession: (options: Record<string, unknown>) => {
    shared.pageDataSessionOptions.push(options)
    return {
      reset: shared.pageDataReset,
      runLlm: vi.fn(async () => ''),
      sender: vi.fn(async () => {}),
      runtime: {
        taskSteps: { value: [] },
        sseLines: { value: [] },
      },
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
    shared.pageDataReset.mockClear()
    shared.ruleSessionOptions.length = 0
    shared.pageDataSessionOptions.length = 0
    shared.aiWidgetMountCount.value = 0
  })

  it('shares one session host and does not reset the chat session when only the active file changes', async () => {
    const activePageId = ref('orders-page')
    const state = {
      activePageId,
      pageDataDesignerDirty: ref(false),
      readPageEditModel: vi.fn(() => ({
        ruleJson: [],
        pageDataJson: { dataSetName: 'OrdersDS', tables: {} },
        scriptJs: '',
        styleCss: '',
      })),
      addStatus: vi.fn(),
      canPageEditTransactionBack: vi.fn(() => false),
      canPageEditTransactionForward: vi.fn(() => false),
      undoPageEditTransaction: vi.fn(),
      redoPageEditTransaction: vi.fn(),
      getPageEditTransactionCount: vi.fn(() => 0),
      applyPageEditModelPatch: vi.fn(),
      applyPageEditModel: vi.fn(),
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
    expect(shared.ruleSessionOptions[0]?.['sessionHost']).toBe(shared.host)
    expect(shared.pageDataSessionOptions[0]?.['sessionHost']).toBe(shared.host)
    expect(shared.aiWidgetMountCount.value).toBe(1)

    await wrapper.setProps({ activeFile: 'script.js' })
    await nextTick()

    expect(shared.ruleReset).not.toHaveBeenCalled()
    expect(shared.pageDataReset).not.toHaveBeenCalled()
    expect(shared.host.resetSync).not.toHaveBeenCalled()
    expect(shared.aiWidgetMountCount.value).toBe(1)

    activePageId.value = 'orders-page-v2'
    await nextTick()

    expect(shared.host.resetSync).toHaveBeenCalledTimes(1)
    expect(shared.ruleReset).toHaveBeenCalledTimes(1)
    expect(shared.pageDataReset).toHaveBeenCalledTimes(1)
    expect(shared.aiWidgetMountCount.value).toBe(1)
  })
})