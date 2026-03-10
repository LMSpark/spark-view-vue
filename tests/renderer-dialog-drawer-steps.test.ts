import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import RendererDialog from '../src/components/renderer-containers/RendererDialog.vue'
import RendererDrawer from '../src/components/renderer-containers/RendererDrawer.vue'
import RendererSteps from '../src/components/renderer-containers/RendererSteps.vue'

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
      props: {
        title: '编辑用户',
        modelValue: true,
        headerActions: [{ type: 'dialog-header-action' }],
        footerActions: [{ type: 'dialog-footer-action' }],
        gridGap: 12,
        config: {
          type: 'r-dialog',
          children: [
            { type: 'child-a', props: { colSpan: 8 } },
            { type: 'child-b', props: { colSpan: 16 } },
          ],
        },
      },
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

  it('should render steps toolbar and switch active step content', async () => {
    const onStepChange = vi.fn()
    const wrapper = mount(RendererSteps as any, {
      props: {
        toolbar: [{ type: 'steps-toolbar-action' }],
        onStepChange,
        config: {
          type: 'r-steps',
          children: [
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
        },
      },
      slots: {
        toolbar: ({ steps }: Record<string, unknown>) => h('button', {
          class: 'biz-steps-toolbar',
          'data-step-count': String(Array.isArray(steps) ? steps.length : 0),
        }, 'biz-steps-toolbar'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-steps': ElStepsStub,
          'el-step': ElStepStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="steps-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.find('.biz-steps-toolbar').attributes('data-step-count')).toBe('2')
    expect(wrapper.find('.renderer-steps-content').attributes('style')).toContain('display: grid;')
    expect(wrapper.find('.renderer-steps-content').attributes('style')).toContain('gap: 16px;')

    await wrapper.findAll('.el-step-stub')[1]?.trigger('click')
    expect(onStepChange).toHaveBeenCalledWith('step2', expect.objectContaining({ type: 'r-step' }), 1)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['step2'])
  })
})