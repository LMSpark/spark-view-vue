import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import DevSiteTree from '@/views/app/dev-system/DevSiteTree.vue'
import type { ProjectNodeData } from '@spark-view/spark-project-model'
import { useDevState, type DevState } from '@/views/app/dev-system/useDevState'

function createState(node: ProjectNodeData): DevState {
  const state = useDevState()
  state.treeData.value = [node]
  state.navEmpty.value = false
  state.selectedNode.value = null
  state.hasReservedRootGroup = vi.fn<DevState['hasReservedRootGroup']>(() => false)
  state.restoreReservedRootGroup = vi.fn<DevState['restoreReservedRootGroup']>(async () => {})
  state.addRootNode = vi.fn<DevState['addRootNode']>()
  state.addChildNode = vi.fn<DevState['addChildNode']>()
  state.isSystemRootDirectory = vi.fn<DevState['isSystemRootDirectory']>(() => false)
  state.removeNodeFromTree = vi.fn<DevState['removeNodeFromTree']>()
  state.selectNode = vi.fn<DevState['selectNode']>(async () => {})
  state.moveNodeInTree = vi.fn<DevState['moveNodeInTree']>(async () => {})
  return state
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
    const node: ProjectNodeData = { id: 'orders', title: 'Orders', nodeKind: 'page', path: '/orders' }
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
