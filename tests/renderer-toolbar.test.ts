import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { RendererToolbar } from '@spark-view/spark-component'
import type { SparkNode } from '@spark-view/spark-component'
import { liftChildProps, type LiftAsLookup } from '../packages/spark-component/src/page/binding/build-page-children'

const TEST_LIFT_AS_MAP: Record<string, string> = {
  'r-tail': 'tail',
}
const testGetLiftAs: LiftAsLookup = (type) => TEST_LIFT_AS_MAP[type]

function liftTestChildProps(containerType: string, props: Record<string, unknown>): Record<string, unknown> {
  if (!props['children']) return props
  const node = liftChildProps({ type: containerType, children: props['children'] as SparkNode[] }, testGetLiftAs)
  const { children: _, ...rest } = props
  return { ...rest, ...node.props, ...(node.children?.length ? { children: node.children } : {}) }
}

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

describe('RendererToolbar integration', () => {
  it('should render default and tail children in separate horizontal lanes', () => {
    const wrapper = mount(RendererToolbar as any, {
      props: liftTestChildProps('r-toolbar', {
        gap: 10,
        zoneGap: 24,
        children: [
          { type: 'action-a' },
          { type: 'action-b' },
          { type: 'r-tail', children: [{ type: 'action-tail' }] },
        ],
      }),
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

  it('should apply classes from r-tail child props', () => {
    const wrapper = mount(RendererToolbar as any, {
      props: liftTestChildProps('r-toolbar', {
        children: [
          { type: 'main-action' },
          { type: 'r-tail', props: { class: 'toolbar-tail-custom' }, children: [{ type: 'tail-action' }] },
        ],
      }),
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.renderer-toolbar-lane--end').classes()).toContain('toolbar-tail-custom')
  })

  it('should render structured tail prop without requiring wrapper child input', () => {
    const wrapper = mount(RendererToolbar as any, {
      props: {
        children: [
          { type: 'main-action' },
        ],
        tail: {
          type: 'r-tail',
          props: { class: 'toolbar-tail-prop-custom' },
          children: [{ type: 'tail-action-from-prop' }],
        },
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.renderer-toolbar-lane--end').classes()).toContain('toolbar-tail-prop-custom')
    expect(wrapper.find('.spark-action-stub[data-type="tail-action-from-prop"]').exists()).toBe(true)
  })
})