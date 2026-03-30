import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { RendererToolbar } from '@spark-view/spark-component'

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
      'data-dock': String((props.config as Record<string, unknown>)['dock'] ?? 'default'),
    }, (props.config as Record<string, unknown>)['type'] as string)
  },
})

describe('RendererToolbar integration', () => {
  it('should render default and tail docks in separate horizontal lanes', () => {
    const wrapper = mount(RendererToolbar as any, {
      props: {
        gap: 10,
        zoneGap: 24,
        children: [
          { type: 'action-a' },
          { type: 'action-b' },
          { type: 'r-tail', children: [{ type: 'action-tail' }] },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.renderer-toolbar').attributes('style')).toContain('display: grid;')
    expect(wrapper.find('.renderer-toolbar').attributes('style')).toContain('column-gap: 24px;')

    const startLane = wrapper.find('.renderer-toolbar-lane--start')
    const endLane = wrapper.find('.renderer-toolbar-lane--end')
    expect(startLane.exists()).toBe(true)
    expect(endLane.exists()).toBe(true)
    expect(startLane.attributes('style')).toContain('grid-auto-flow: column;')
    expect(startLane.attributes('style')).toContain('gap: 10px;')
    expect(endLane.attributes('style')).toContain('justify-content: end;')

    const startItems = startLane.findAll('.spark-action-stub')
    const endItems = endLane.findAll('.spark-action-stub')
    expect(startItems).toHaveLength(2)
    expect(endItems).toHaveLength(1)
    expect(startItems[0]?.attributes('data-type')).toBe('action-a')
    expect(startItems[1]?.attributes('data-type')).toBe('action-b')
    expect(endItems[0]?.attributes('data-type')).toBe('action-tail')
  })

  it('should apply dock-specific classes from dock node props', () => {
    const wrapper = mount(RendererToolbar as any, {
      props: {
        children: [
          { type: 'main-action' },
          { type: 'r-tail', props: { class: 'toolbar-tail-zone' }, children: [{ type: 'tail-action' }] },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.renderer-toolbar-lane--end').classes()).toContain('toolbar-tail-zone')
  })

  it('should render structured tail dock prop without requiring wrapper child input', () => {
    const wrapper = mount(RendererToolbar as any, {
      props: {
        children: [
          { type: 'main-action' },
        ],
        tail: {
          type: 'r-tail',
          props: { class: 'toolbar-tail-prop-zone' },
          children: [{ type: 'tail-action-from-prop' }],
        },
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.renderer-toolbar-lane--end').classes()).toContain('toolbar-tail-prop-zone')
    expect(wrapper.find('.spark-action-stub[data-type="tail-action-from-prop"]').exists()).toBe(true)
  })
})