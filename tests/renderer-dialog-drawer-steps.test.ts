import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { RendererDialog, RendererDrawer, RendererSteps, Spark, useSparkComponent } from '@spark-view/spark-component'
import type { SparkNode } from '@spark-view/spark-component'
import { liftDockChildren, type DockTypeLookup } from '../packages/spark-component/src/page/binding/build-page-children'

const TEST_DOCK_MAP: Record<string, ReadonlySet<string>> = {
  'r-dialog': new Set(['r-header', 'r-footer']),
  'r-drawer': new Set(['r-header', 'r-footer']),
  'r-steps': new Set(['r-toolbar']),
}
const testGetDocks: DockTypeLookup = (type) => TEST_DOCK_MAP[type]

function liftTestDocks(containerType: string, props: Record<string, unknown>): Record<string, unknown> {
  if (!props['children']) return props
  const node = liftDockChildren({ type: containerType, children: props['children'] as SparkNode[] }, testGetDocks)
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

const ElDialogStub = defineComponent({
  props: {
    modelValue: Boolean,
  },
  setup(props, { slots }) {
    return () => h('div', { class: 'el-dialog-stub', 'data-visible': String(props.modelValue) }, [
      slots['header']?.(),
      slots['default']?.(),
      slots['footer']?.(),
    ])
  },
})

const ElDrawerStub = defineComponent({
  props: {
    modelValue: Boolean,
  },
  setup(props, { slots }) {
    return () => h('div', { class: 'el-drawer-stub', 'data-visible': String(props.modelValue) }, [
      slots['header']?.(),
      slots['default']?.(),
      slots['footer']?.(),
    ])
  },
})

const ElStepsStub = defineComponent({
  props: {
    active: Number,
  },
  setup(props, { slots }) {
    return () => h('div', { class: 'el-steps-stub', 'data-active': String(props.active ?? '') }, slots['default']?.())
  },
})

const ElStepStub = defineComponent({
  props: {
    title: String,
    description: String,
    status: String,
  },
  emits: ['click'],
  setup(props, { emit }) {
    return () => h('button', {
      class: 'el-step-stub',
      'data-title': props.title,
      onClick: () => emit('click'),
    }, props.title)
  },
})

describe('RendererDialog, RendererDrawer and RendererSteps integration', () => {
  it('should render dialog header/footer actions and body grid', () => {
    const wrapper = mount(RendererDialog as any, {
      props: liftTestDocks('r-dialog', {
        title: '编辑用户',
        modelValue: true,
        gridGap: 12,
        children: [
          { type: 'r-header', children: [{ type: 'dialog-header-action' }] },
          { type: 'r-footer', children: [{ type: 'dialog-footer-action' }] },
          { type: 'child-a', props: { colSpan: 8 } },
          { type: 'child-b', props: { colSpan: 16 } },
        ],
      }),
      slots: {
        footer: ({ title }: Record<string, unknown>) => h('button', {
          class: 'biz-dialog-footer',
          'data-title': String(title ?? ''),
        }, 'biz-dialog-footer'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-dialog': ElDialogStub,
        },
      },
    })

    expect(wrapper.find('.renderer-dialog-title').text()).toContain('编辑用户')
    expect(wrapper.find('.spark-action-stub[data-type="dialog-header-action"]').exists()).toBe(true)
    expect(wrapper.find('.spark-action-stub[data-type="dialog-footer-action"]').exists()).toBe(true)
    expect(wrapper.find('.biz-dialog-footer').attributes('data-title')).toBe('编辑用户')
    expect(wrapper.find('.renderer-dialog-body').attributes('style')).toContain('display: grid;')
    expect(wrapper.findAll('.renderer-dialog-grid-item')[0]?.attributes('style')).toContain('grid-column: span 8 / span 8;')
  })

  it('should fail fast for legacy dialog header/footer action props', () => {
    expect(() => mount(RendererDialog as any, {
      props: {
        title: '编辑用户',
        headerActions: [{ type: 'legacy-header-action' }],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-dialog': ElDialogStub,
        },
      },
    })).toThrow('props.headerActions 已废除')

    expect(() => mount(RendererDialog as any, {
      props: {
        title: '编辑用户',
        footerActions: [{ type: 'legacy-footer-action' }],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-dialog': ElDialogStub,
        },
      },
    })).toThrow('props.footerActions 已废除')
  })

  it('should emit drawer model updates and render footer slot', () => {
    const wrapper = mount(RendererDrawer as any, {
      props: {
        title: '抽屉详情',
        modelValue: true,
      },
      slots: {
        footer: ({ visible }: Record<string, unknown>) => h('button', {
          class: 'biz-drawer-footer',
          'data-visible': String(visible ?? ''),
        }, 'biz-drawer-footer'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-drawer': ElDrawerStub,
        },
      },
    })

    wrapper.findComponent(ElDrawerStub).vm.$emit('update:modelValue', false)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    expect(wrapper.find('.biz-drawer-footer').attributes('data-visible')).toBe('true')
  })

  it('should render docked steps toolbar children and switch active step content', async () => {
    const onStepChange = vi.fn()
    const wrapper = mount(RendererSteps as any, {
      props: liftTestDocks('r-steps', {
        onStepChange,
        children: [
          { type: 'r-toolbar', children: [{ type: 'steps-toolbar-action' }] },
          {
            type: 'r-step',
            props: { title: '步骤一', name: 'step1', gridGap: 16 },
            children: [
              { type: 'child-a', props: { colSpan: 12 } },
            ],
          },
          {
            type: 'r-step',
            props: { title: '步骤二', name: 'step2' },
            children: [
              { type: 'child-b', props: { colSpan: 24 } },
            ],
          },
        ],
      }),
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-steps': ElStepsStub,
          'el-step': ElStepStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="steps-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.find('.renderer-steps-content-body').attributes('style')).toContain('display: grid;')
    expect(wrapper.find('.renderer-steps-content-body').attributes('style')).toContain('gap: 16px;')

    await wrapper.findAll('.el-step-stub')[1]?.trigger('click')
    expect(onStepChange).toHaveBeenCalledWith('step2', expect.objectContaining({ type: 'r-step' }), 1)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['step2'])
  })

  it('should resolve step fields from props only', async () => {
    const onStepChange = vi.fn()
    const wrapper = mount(RendererSteps as any, {
      props: {
        onStepChange,
        children: [
          {
            type: 'r-step',
            props: { title: '根级步骤一', name: 'root-step-1', gridGap: 14 },
            children: [
              { type: 'child-a', props: { colSpan: 11 } },
            ],
          },
          {
            type: 'r-step',
            props: { title: '根级步骤二', name: 'root-step-2' },
            children: [
              { type: 'child-b', props: { colSpan: 24 } },
            ],
          },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-steps': ElStepsStub,
          'el-step': ElStepStub,
        },
      },
    })

    expect(wrapper.find('.renderer-steps-content-body').attributes('style')).toContain('gap: 14px;')
    expect(wrapper.find('.renderer-steps-content-grid-item').attributes('style')).toContain('grid-column: span 11 / span 11;')

    await wrapper.findAll('.el-step-stub')[1]?.trigger('click')
    expect(onStepChange).toHaveBeenCalledWith('root-step-2', expect.objectContaining({ type: 'r-step' }), 1)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['root-step-2'])
  })
})

describe('Direct Vue children bridge (dialog / drawer)', () => {
  const ContextProbe = defineComponent({
    name: 'ContextProbe',
    setup() {
      const { parentType } = useSparkComponent({ type: 'probe-field' })
      return () => h('div', {
        class: 'context-probe',
        'data-parent-type': parentType ?? '',
      }, 'probe')
    },
  })

  function mountWithSpark(component: any, options: Record<string, unknown>) {
    const plugin = Spark.createPlugin()
    return mount(component, {
      ...options,
      global: {
        plugins: [plugin],
        stubs: {
          'el-dialog': ElDialogStub,
          'el-drawer': ElDrawerStub,
        },
        ...(options['global'] as Record<string, unknown> | undefined),
      },
    })
  }

  it('should propagate r-dialog parent context to direct Vue slot children', () => {
    const wrapper = mountWithSpark(RendererDialog, {
      props: { title: '对话框', modelValue: true },
      slots: {
        default: () => h(ContextProbe),
      },
    })

    expect(wrapper.find('.context-probe').attributes('data-parent-type')).toBe('r-dialog')
  })

  it('should propagate r-drawer parent context to direct Vue slot children', () => {
    const wrapper = mountWithSpark(RendererDrawer, {
      props: { title: '抽屉', modelValue: true },
      slots: {
        default: () => h(ContextProbe),
      },
    })

    expect(wrapper.find('.context-probe').attributes('data-parent-type')).toBe('r-drawer')
  })
})