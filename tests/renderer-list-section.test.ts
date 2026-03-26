import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { RendererList, RendererSection } from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'
import { mountWithPageDataSet } from './helpers/mount-with-page-dataset'

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
  it('should render docked list toolbar children, item actions and template-driven item rendering with grid layout', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'ListDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob', _perm: { allowDelete: false } }],
        },
      },
    })
    const listView = ds.getView('Users', 'default')!
    ;(listView as typeof listView & { _modelPerm?: Record<string, unknown> })._modelPerm = { allowExport: true }

    const wrapper = mountWithPageDataSet(RendererList as any, {
      dataSet: ds,
      props: {
        dataKey: 'Users@rows',
        docks: { toolbar: { position: 'bottom' }, actions: { position: 'left' } },
        gridGap: 12,
        itemColSpan: 12,
        children: [
          { type: 'list-toolbar-action', dock: 'toolbar' },
          { type: 'list-item-delete', dock: 'actions', props: { permAction: 'delete' } },
        ],
      },
      slots: {
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

  it('should fail fast for legacy list itemActions prop', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'ListLegacyDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' as const }],
          rows: [{ id: 1 }],
        },
      },
    })

    expect(() => mountWithPageDataSet(RendererList as any, {
      dataSet: ds,
      props: {
        dataKey: 'Users@rows',
        itemActions: [{ type: 'legacy-list-action' }],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-card': ElCardStub,
        },
      },
    })).toThrow('props.itemActions 已废除')
  })

  it('should allow section header slot and default slot scopes to control collapse state', async () => {
    const wrapper = mount(RendererSection as any, {
      props: {
        title: '基础信息',
        description: 'desc',
        collapsible: true,
        defaultCollapsed: true,
        children: [{ type: 'section-header-action', dock: 'header' }],
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

  it('should fail fast for legacy section headerActions prop', () => {
    expect(() => mount(RendererSection as any, {
      props: {
        title: '基础信息',
        headerActions: [{ type: 'legacy-section-action' }],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-card': ElCardStub,
        },
      },
    })).toThrow('props.headerActions 已废除')
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

  it('should honor child span props in section grid layout', () => {
    const wrapper = mount(RendererSection as any, {
      props: {
        title: '根级布局区块',
        gridGap: 10,
        children: [
          { type: 'child-a', props: { colSpan: 7, rowSpan: 2 } },
          { type: 'child-b', props: { colSpan: 17 } },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-card': ElCardStub,
        },
      },
    })

    expect(wrapper.find('.renderer-section-body').attributes('style')).toContain('gap: 10px;')
    const gridItems = wrapper.findAll('.renderer-section-grid-item')
    expect(gridItems).toHaveLength(2)
    expect(gridItems[0]?.attributes('style')).toContain('grid-column: span 7 / span 7;')
    expect(gridItems[0]?.attributes('style')).toContain('grid-row: span 2 / span 2;')
    expect(gridItems[1]?.attributes('style')).toContain('grid-column: span 17 / span 17;')
  })
})