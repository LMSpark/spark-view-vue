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
  it('should render tabs panes with toolbar children and pane grid body', () => {
    const onTabChange = vi.fn()
    const wrapper = mount(RendererTabs as any, {
      props: {
        onTabChange,
        toolbar: { type: 'r-toolbar', children: [{ type: 'tabs-toolbar-action' }] },
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
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-tabs': ElTabsStub,
          'el-tab-pane': ElTabPaneStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="tabs-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.findAll('.el-tab-pane-stub')).toHaveLength(2)
    expect(wrapper.find('.renderer-tabs-pane-body').attributes('style')).toContain('display: grid;')
    expect(wrapper.find('.renderer-tabs-pane-body').attributes('style')).toContain('gap: 16px;')
    const gridItems = wrapper.findAll('.renderer-tabs-pane-grid-item')
    expect(gridItems[0]?.attributes('style')).toContain('grid-column: span 12 / span 12;')
    expect(gridItems[1]?.attributes('style')).toContain('grid-row: span 2 / span 2;')

    wrapper.findComponent(ElTabsStub).vm.$emit('tab-change', 'more')
    expect(onTabChange).toHaveBeenCalledWith('more')
  })

  it('should resolve pane fields from props only', () => {
    const wrapper = mount(RendererTabs as any, {
      props: {
        children: [
          {
            type: 'r-tab-pane',
            props: { label: '根级标签', name: 'root-pane', gridGap: 18 },
            children: [
              { type: 'child-a', props: { colSpan: 10 } },
              { type: 'child-b', props: { colSpan: 14, rowSpan: 2 } },
            ],
          },
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

    const pane = wrapper.find('.el-tab-pane-stub')
    expect(pane.attributes('data-label')).toBe('根级标签')
    expect(pane.attributes('data-name')).toBe('root-pane')
    expect(wrapper.find('.renderer-tabs-pane-body').attributes('style')).toContain('gap: 18px;')
    const gridItems = wrapper.findAll('.renderer-tabs-pane-grid-item')
    expect(gridItems[0]?.attributes('style')).toContain('grid-column: span 10 / span 10;')
    expect(gridItems[1]?.attributes('style')).toContain('grid-row: span 2 / span 2;')
  })

  it('should emit tabs value updates', () => {
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
    expect(wrapper.emitted('update:value')?.[0]).toEqual(['a'])
  })

  it('should render collapse items with toolbar children and item grid body', () => {
    const onChange = vi.fn()
    const wrapper = mount(RendererCollapse as any, {
      props: {
        onChange,
        toolbar: { type: 'r-toolbar', children: [{ type: 'collapse-toolbar-action' }] },
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
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-collapse': ElCollapseStub,
          'el-collapse-item': ElCollapseItemStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="collapse-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.findAll('.el-collapse-item-stub')).toHaveLength(2)
    expect(wrapper.find('.renderer-collapse-item-body').attributes('style')).toContain('display: grid;')
    expect(wrapper.find('.renderer-collapse-item-body').attributes('style')).toContain('gap: 12px;')
    const gridItems = wrapper.findAll('.renderer-collapse-item-grid-item')
    expect(gridItems[0]?.attributes('style')).toContain('grid-column: span 8 / span 8;')
    expect(gridItems[1]?.attributes('style')).toContain('grid-column: span 16 / span 16;')

    wrapper.findComponent(ElCollapseStub).vm.$emit('change', ['one'])
    expect(onChange).toHaveBeenCalledWith(['one'])
  })

  it('should resolve collapse item fields from props only', () => {
    const wrapper = mount(RendererCollapse as any, {
      props: {
        children: [
          {
            type: 'r-collapse-item',
            props: { title: '根级分组', name: 'root-item', gridGap: 20 },
            children: [
              { type: 'child-a', props: { colSpan: 6 } },
              { type: 'child-b', props: { colSpan: 18 } },
            ],
          },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-collapse': ElCollapseStub,
          'el-collapse-item': ElCollapseItemStub,
        },
      },
    })

    const item = wrapper.find('.el-collapse-item-stub')
    expect(item.attributes('data-title')).toBe('根级分组')
    expect(item.attributes('data-name')).toBe('root-item')
    expect(wrapper.find('.renderer-collapse-item-body').attributes('style')).toContain('gap: 20px;')
    const gridItems = wrapper.findAll('.renderer-collapse-item-grid-item')
    expect(gridItems[0]?.attributes('style')).toContain('grid-column: span 6 / span 6;')
    expect(gridItems[1]?.attributes('style')).toContain('grid-column: span 18 / span 18;')
  })
})