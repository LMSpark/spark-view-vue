import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { RendererTabs, RendererCollapse } from '@spark-view/spark-component'

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

const ElTabsStub = defineComponent({
  name: 'ElTabsStub',
  setup(_, { slots }) {
    return () => h('div', { class: 'el-tabs-stub' }, slots['default']?.())
  },
})

const ElTabPaneStub = defineComponent({
  props: {
    label: String,
    name: [String, Number],
  },
  setup(props, { slots }) {
    return () => h('section', {
      class: 'el-tab-pane-stub',
      'data-label': props.label,
      'data-name': String(props.name ?? ''),
    }, slots['default']?.())
  },
})

const ElCollapseStub = defineComponent({
  name: 'ElCollapseStub',
  setup(_, { slots }) {
    return () => h('div', { class: 'el-collapse-stub' }, slots['default']?.())
  },
})

const ElCollapseItemStub = defineComponent({
  props: {
    title: String,
    name: [String, Number],
  },
  setup(props, { slots }) {
    return () => h('section', {
      class: 'el-collapse-item-stub',
      'data-title': props.title,
      'data-name': String(props.name ?? ''),
    }, slots['default']?.())
  },
})

describe('RendererTabs and RendererCollapse integration', () => {
  it('should render tabs panes with toolbar and pane grid body', () => {
    const onTabChange = vi.fn()
    const wrapper = mount(RendererTabs as any, {
      props: {
        toolbar: [{ type: 'tabs-toolbar-action' }],
        onTabChange,
        children: [
          {
            type: 'r-tab-pane',
            props: { label: '基本信息', name: 'base', gridGap: 16 },
            children: [
              { type: 'child-a', props: { colSpan: 12 } },
              { type: 'child-b', props: { colSpan: 12, rowSpan: 2 } },
            ],
          },
          {
            type: 'r-tab-pane',
            props: { label: '更多信息', name: 'more' },
            children: [],
          },
        ],
      },
      slots: {
        toolbar: ({ panes }: Record<string, unknown>) => h('button', {
          class: 'biz-tabs-toolbar',
          'data-pane-count': String(Array.isArray(panes) ? panes.length : 0),
        }, 'biz-tabs-toolbar'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-tabs': ElTabsStub,
          'el-tab-pane': ElTabPaneStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="tabs-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.find('.biz-tabs-toolbar').attributes('data-pane-count')).toBe('2')
    expect(wrapper.findAll('.el-tab-pane-stub')).toHaveLength(2)
    expect(wrapper.find('.renderer-tabs-pane-body').attributes('style')).toContain('display: grid;')
    expect(wrapper.find('.renderer-tabs-pane-body').attributes('style')).toContain('gap: 16px;')
    const gridItems = wrapper.findAll('.renderer-tabs-pane-grid-item')
    expect(gridItems[0]?.attributes('style')).toContain('grid-column: span 12 / span 12;')
    expect(gridItems[1]?.attributes('style')).toContain('grid-row: span 2 / span 2;')

    wrapper.findComponent(ElTabsStub).vm.$emit('tab-change', 'more')
    expect(onTabChange).toHaveBeenCalledWith('more')
  })

  it('should emit tabs model updates', () => {
    const wrapper = mount(RendererTabs as any, {
      props: {
        children: [
          { type: 'r-tab-pane', props: { label: 'A', name: 'a' }, children: [] },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-tabs': ElTabsStub,
          'el-tab-pane': ElTabPaneStub,
        },
      },
    })

    wrapper.findComponent(ElTabsStub).vm.$emit('update:modelValue', 'a')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['a'])
  })

  it('should render collapse items with toolbar and item grid body', () => {
    const onChange = vi.fn()
    const wrapper = mount(RendererCollapse as any, {
      props: {
        toolbar: [{ type: 'collapse-toolbar-action' }],
        onChange,
        children: [
          {
            type: 'r-collapse-item',
            props: { title: '分组一', name: 'one', gridGap: 12 },
            children: [
              { type: 'child-a', props: { colSpan: 8 } },
              { type: 'child-b', props: { colSpan: 16 } },
            ],
          },
          {
            type: 'r-collapse-item',
            props: { title: '分组二', name: 'two' },
            children: [],
          },
        ],
      },
      slots: {
        toolbar: ({ items }: Record<string, unknown>) => h('button', {
          class: 'biz-collapse-toolbar',
          'data-item-count': String(Array.isArray(items) ? items.length : 0),
        }, 'biz-collapse-toolbar'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-collapse': ElCollapseStub,
          'el-collapse-item': ElCollapseItemStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="collapse-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.find('.biz-collapse-toolbar').attributes('data-item-count')).toBe('2')
    expect(wrapper.findAll('.el-collapse-item-stub')).toHaveLength(2)
    expect(wrapper.find('.renderer-collapse-item-body').attributes('style')).toContain('display: grid;')
    expect(wrapper.find('.renderer-collapse-item-body').attributes('style')).toContain('gap: 12px;')
    const gridItems = wrapper.findAll('.renderer-collapse-grid-item')
    expect(gridItems[0]?.attributes('style')).toContain('grid-column: span 8 / span 8;')
    expect(gridItems[1]?.attributes('style')).toContain('grid-column: span 16 / span 16;')

    wrapper.findComponent(ElCollapseStub).vm.$emit('change', ['one'])
    expect(onChange).toHaveBeenCalledWith(['one'])
  })
})