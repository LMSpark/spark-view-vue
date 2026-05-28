import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DevPreviewTab from '@/views/app/dev-system/DevPreviewTab.vue'
import type { DevState } from '@/views/app/dev-system/useDevState'
import type { PageModelFileName } from '@spark-view/spark-page-config'

const SwitchStub = defineComponent({
  name: 'ElSwitch',
  props: {
    modelValue: Boolean,
  },
  emits: ['update:modelValue'],
  setup() {
    return () => h('span', { class: 'el-switch-stub' })
  },
})

const ButtonStub = defineComponent({
  name: 'ElButton',
  emits: ['click'],
  setup(_, { emit, slots }) {
    return () => h('button', { type: 'button', onClick: () => emit('click') }, slots['default']?.())
  },
})

const RendererStub = defineComponent({
  name: 'SparkPageRenderer',
  props: {
    pageModel: Object,
    pageModelRevision: Number,
  },
  setup(props) {
    return () => h('div', { class: 'renderer-stub', 'data-page-id': props.pageModel?.['pageId'] })
  },
})

function createPreviewState() {
  const activePageId = ref('cascade-demo')
  const pageFilesRevision = ref(1)
  const files: Record<PageModelFileName, string> = {
    'rule.json': '[]',
    'pagedata.json': '{"dataSetName":"Demo","tables":{}}',
    'script.js': '',
    'style.css': '',
  }
  const getActivePage = vi.fn(() => ({ pageId: activePageId.value, isLoaded: true }))
  const state: DevState = Object.assign(Object.create(null), {
    activePageId,
    pageFilesRevision,
    getActivePage,
    getPageFileText: vi.fn((name: PageModelFileName) => {
      void pageFilesRevision.value
      return files[name]
    }),
  })

  return {
    state,
    files,
    pageFilesRevision,
    getActivePage,
  }
}

describe('DevPreviewTab live refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not rebuild preview when editor revision changes but in-memory page files are unchanged', async () => {
    const { state, files, pageFilesRevision, getActivePage } = createPreviewState()

    mount(DevPreviewTab, {
      props: {
        state,
        refreshToken: 0,
      },
      global: {
        stubs: {
          ElAlert: true,
          ElButton: ButtonStub,
          ElEmpty: true,
          ElIcon: true,
          ElSwitch: SwitchStub,
          Loading: true,
          NavIcon: true,
          SparkPageRenderer: RendererStub,
        },
      },
    })

    expect(getActivePage).toHaveBeenCalledTimes(1)

    pageFilesRevision.value += 1
    await nextTick()
    vi.advanceTimersByTime(600)
    await nextTick()

    expect(getActivePage).toHaveBeenCalledTimes(1)

    files['script.js'] = 'console.log("changed")'
    pageFilesRevision.value += 1
    await nextTick()
    vi.advanceTimersByTime(600)
    await nextTick()

    expect(getActivePage).toHaveBeenCalledTimes(2)
  })
})
