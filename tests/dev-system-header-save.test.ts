import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DevSystem from '@/views/app/dev-system/DevSystem.vue'

let devSystemCtx: ReturnType<typeof createDevSystemCtx>

vi.mock('@/views/app/dev-system/useDevSystem', () => ({
  useDevSystem: () => devSystemCtx,
}))

function createDevSystemCtx(overrides: Record<string, unknown> = {}) {
  const state = {
    hasAnyDirty: ref(false),
    navSaving: ref(false),
    fileSaving: ref(false),
    navLoading: ref(false),
    selectedNode: ref({ id: 'dbms', title: '数据库管理' }),
    navDraft: { id: 'dbms', title: '数据库管理' },
    activePageId: ref('dbms'),
    navDirty: ref(false),
    hasAnyFileDirty: ref(false),
    pageDesignAiRunning: ref(false),
    pageDataError: ref(null),
    statusMessages: ref([]),
    pageList: ref([]),
    initialize: vi.fn().mockResolvedValue(undefined),
  }

  return {
    state,
    workTab: ref('props'),
    previewRefreshToken: ref(0),
    currentWorkspaceFile: ref(null),
    pageDesignAiPrompt: ref(''),
    canPreviewCurrentPage: ref(true),
    canSaveFromHeader: ref(true),
    canRunPageDesignAi: ref(false),
    headerSaveLabel: ref('保存'),
    previewPage: vi.fn(),
    switchToPreview: vi.fn(),
    saveAll: vi.fn(),
    runPageDesignAi: vi.fn(),
    isWorkspaceTabDirty: vi.fn(() => false),
    ...overrides,
  }
}

const ButtonStub = defineComponent({
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
})

const PassthroughStub = defineComponent({
  template: '<div><slot name="label" /><slot /></div>',
})

describe('DevSystem header save action', () => {
  beforeEach(() => {
    devSystemCtx = createDevSystemCtx()
  })

  it('shows a save button for clean editable node props and triggers save', async () => {
    const wrapper = mount(DevSystem, {
      global: {
        directives: {
          loading: {
            mounted: vi.fn(),
            updated: vi.fn(),
          },
        },
        stubs: {
          DevSiteTree: true,
          DevNodeProps: true,
          DevFileEditor: true,
          DevPreviewTab: true,
          ElButton: ButtonStub,
          ElEmpty: true,
          ElInput: true,
          ElTabPane: PassthroughStub,
          ElTabs: PassthroughStub,
          ElTag: true,
          NavIcon: true,
        },
      },
    })

    const saveButton = wrapper.findAll('button').find(button => button.text().includes('保存'))
    expect(saveButton).toBeDefined()

    await saveButton!.trigger('click')

    expect(devSystemCtx.saveAll).toHaveBeenCalledOnce()
  })
})
