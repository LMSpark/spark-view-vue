import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { RendererList, RendererSection } from '@spark-view/spark-component'

const SparkActionStub = defineComponent({
  props: {
    config: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => h('button', {
      class: 'spark-action-stub',
      'data-type': (props.config as Record<string, unknown>)['type'] as string,
    }, (props.config as Record<string, unknown>)['type'] as string)
  },
})

const ElCardStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', { class: 'el-card-stub' }, [
      slots['header']?.(),
      slots['default']?.(),
    ])
  },
})

describe('RendererList and RendererSection container integration', () => {
  it('should allow list toolbar slot, item actions and template-driven item rendering with grid layout', async () => {
    const wrapper = mount(RendererList as any, {
      props: {
        dataView: {
          rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob', _perm: { allowDelete: false } }],
          _modelPerm: { allowExport: true },
        },
        toolbar: [{ type: 'list-toolbar-action' }],
        toolbarPosition: 'bottom',
        itemActions: [{ type: 'list-item-delete', props: { permAction: 'delete' } }],
        itemActionsPosition: 'left',
        gridGap: 12,
        itemColSpan: 12,
      },
      slots: {
        toolbar: ({ rows, modelPermission }: Record<string, unknown>) => h('button', {
          class: 'biz-list-toolbar',
          'data-row-count': String(Array.isArray(rows) ? rows.length : 0),
          'data-can-export': String((modelPermission as Record<string, unknown>)['allowExport'] ?? ''),
        }, 'biz-list-toolbar'),
        default: ({ row, rowIndex }: Record<string, unknown>) => h('div', {
          class: 'biz-list-item',
          'data-row-id': String((row as Record<string, unknown>)['id'] ?? ''),
          'data-row-index': String(rowIndex ?? ''),
        }, 'biz-list-item'),
        'item-actions': ({ row, rowIndex }: Record<string, unknown>) => h('button', {
          class: 'biz-item-action',
          'data-row-id': String((row as Record<string, unknown>)['id'] ?? ''),
          'data-row-index': String(rowIndex ?? ''),
        }, 'biz-item-action'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-card': ElCardStub,
        },
      },
    })

    expect(wrapper.find('.renderer-list-layout--bottom').exists()).toBe(true)
    expect(wrapper.find('.spark-action-stub[data-type="list-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.find('.renderer-list-item-shell--left').exists()).toBe(true)
    expect(wrapper.find('.biz-list-toolbar').attributes('data-row-count')).toBe('2')
    expect(wrapper.find('.biz-list-toolbar').attributes('data-can-export')).toBe('true')
    expect(wrapper.findAll('.biz-list-item')).toHaveLength(2)
    expect(wrapper.findAll('.biz-list-item')[1]?.attributes('data-row-id')).toBe('2')
    const renderedItemActions = wrapper.findAll('.spark-action-stub[data-type="list-item-delete"]')
    expect(renderedItemActions).toHaveLength(1)
    const slotItemActions = wrapper.findAll('.biz-item-action')
    expect(slotItemActions).toHaveLength(2)
    expect(slotItemActions[1]?.attributes('data-row-id')).toBe('2')
    expect(wrapper.find('.renderer-list').attributes('style')).toContain('grid-template-columns: repeat(24, minmax(0, 1fr));')
    expect(wrapper.find('.renderer-list').attributes('style')).toContain('gap: 12px;')
    expect(wrapper.find('.renderer-list-cell').attributes('style')).toContain('grid-column: span 12 / span 12;')

    await nextTick()
  })

  it('should allow section header slot and default slot scopes to control collapse state', async () => {
    const wrapper = mount(RendererSection as any, {
      props: {
        title: '基础信息',
        description: 'desc',
        collapsible: true,
        defaultCollapsed: true,
        headerActions: [{ type: 'section-header-action' }],
      },
      slots: {
        'header-actions': ({ collapsed, toggleCollapsed }: Record<string, unknown>) => h('button', {
          class: 'biz-section-header-action',
          'data-collapsed': String(collapsed ?? ''),
          onClick: () => (toggleCollapsed as () => void)(),
        }, 'biz-section-header-action'),
        default: ({ title, collapsed }: Record<string, unknown>) => h('div', {
          class: 'biz-section-body',
          'data-title': String(title ?? ''),
          'data-collapsed': String(collapsed ?? ''),
        }, 'biz-section-body'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-card': ElCardStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="section-header-action"]').exists()).toBe(true)
    expect(wrapper.find('.biz-section-header-action').attributes('data-collapsed')).toBe('true')
    expect(wrapper.find('.biz-section-body').attributes('data-title')).toBe('基础信息')
    expect(wrapper.find('.biz-section-body').attributes('data-collapsed')).toBe('true')

    await wrapper.find('.biz-section-header-action').trigger('click')
    await nextTick()

    expect(wrapper.find('.biz-section-body').attributes('data-collapsed')).toBe('false')
  })

  it('should keep section body on CSS Grid and honor child spans', () => {
    const wrapper = mount(RendererSection as any, {
      props: {
        title: '布局区块',
        gridGap: 16,
        children: [
          { type: 'child-a', props: { colSpan: 12, rowSpan: 2 } },
          { type: 'child-b', props: { colSpan: 12 } },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-card': ElCardStub,
        },
      },
    })

    expect(wrapper.find('.renderer-section-body').attributes('style')).toContain('display: grid;')
    expect(wrapper.find('.renderer-section-body').attributes('style')).toContain('grid-template-columns: repeat(24, minmax(0, 1fr));')
    expect(wrapper.find('.renderer-section-body').attributes('style')).toContain('gap: 16px;')
    const gridItems = wrapper.findAll('.renderer-section-grid-item')
    expect(gridItems).toHaveLength(2)
    expect(gridItems[0]?.attributes('style')).toContain('grid-column: span 12 / span 12;')
    expect(gridItems[0]?.attributes('style')).toContain('grid-row: span 2 / span 2;')
  })
})