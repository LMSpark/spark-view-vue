import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DevSystem from '@/views/app/dev-system/DevSystem.vue'
import type { DevSystemCtx } from '@/views/app/dev-system/useDevSystem'

let devSystemCtx: DevSystemCtx

vi.mock('@/views/app/dev-system/useDevSystem', () => ({
  useDevSystem: () => devSystemCtx,
}))

function createDevSystemCtx(overrides: Partial<DevSystemCtx> = {}): DevSystemCtx {
  const state = {
    hasAnyDirty: ref(false),
    navSaving: ref(false),
    fileSaving: ref(false),
    navLoading: ref(false),
    selectedNode: ref({ id: 'dbms', title: '数据库管理' }),
    editForm: { id: 'dbms', title: '数据库管理' },
    activePageId: ref('dbms'),
    navDirty: ref(false),
    hasAnyFileDirty: ref(false),
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
    canPreviewCurrentPage: ref(true),
    canSaveFromHeader: ref(true),
    headerSaveLabel: ref('保存'),
    previewPage: vi.fn(),
    switchToPreview: vi.fn(),
    saveAll: vi.fn(),
    isWorkspaceTabDirty: vi.fn(() => false),
    ...overrides,
  } as unknown as DevSystemCtx
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
