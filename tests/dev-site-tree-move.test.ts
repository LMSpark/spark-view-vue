import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import DevSiteTree from '@/views/app/dev-system/DevSiteTree.vue'
import type { NavNode } from '@spark-view/spark-page-config'
import type { DevState } from '@/views/app/dev-system/useDevState'

function createState(node: NavNode): DevState {
  return {
    treeData: ref([node]),
    navEmpty: ref(false),
    selectedNode: ref(null),
    hasReservedRootGroup: vi.fn(() => false),
    restoreReservedRootGroup: vi.fn(),
    addRootNode: vi.fn(),
    addChildNode: vi.fn(),
    isSystemRootDirectory: vi.fn(() => false),
    removeNodeFromTree: vi.fn(),
    selectNode: vi.fn(),
    moveNodeInTree: vi.fn().mockResolvedValue(undefined),
    resetToDemo: vi.fn().mockResolvedValue(undefined),
  } as unknown as DevState
}

const ElTreeDropStub = defineComponent({
  props: {
    data: {
      type: Array,
      default: () => [],
    },
  },
  emits: ['node-drop'],
  template: '<button class="emit-drop" @click="$emit(\'node-drop\', { data: data[0] })">drop</button>',
})

describe('DevSiteTree move persistence', () => {
  it('persists drag-drop through moveNodeInTree', async () => {
    const node: NavNode = { id: 'orders', title: 'Orders', nodeKind: 'page', path: '/orders' }
    const state = createState(node)

    const wrapper = mount(DevSiteTree, {
      props: { state },
      global: {
        stubs: {
          NavIcon: true,
          ElButton: true,
          ElDropdown: true,
          ElDropdownItem: true,
          ElDropdownMenu: true,
          ElEmpty: true,
          ElInput: true,
          ElTag: true,
          ElTree: ElTreeDropStub,
        },
      },
    })

    await wrapper.find('.emit-drop').trigger('click')

    expect(state.moveNodeInTree).toHaveBeenCalledWith(node)
  })
})
