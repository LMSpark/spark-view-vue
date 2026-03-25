import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { RendererForm, RendererDetail } from '@spark-view/spark-component'

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

const ElFormStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-stub' }, slots['default']?.())
  },
})

describe('RendererForm and RendererDetail toolbar integration', () => {
  it('should render docked form toolbar children and default slot scopes', () => {
    const wrapper = mount(RendererForm as any, {
      props: {
        dataView: {
          currentRow: { id: 1, name: 'Alice' },
          _modelPerm: { allowCreate: true },
        },
        children: [{ type: 'form-toolbar-action', dock: 'toolbar' }],
      },
      slots: {
        default: ({ model }: Record<string, unknown>) => h('div', {
          class: 'biz-form-template',
          'data-name': String((model as Record<string, unknown>)['name'] ?? ''),
        }, 'biz-form-template'),
      },
      global: {
        stubs: {
          'el-form': ElFormStub,
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="form-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.find('.biz-form-template').attributes('data-name')).toBe('Alice')
  })

  it('should render docked detail toolbar children and default slot scopes', () => {
    const wrapper = mount(RendererDetail as any, {
      props: {
        dataView: {
          currentRow: { id: 2, title: 'Detail Row' },
          _modelPerm: { allowExport: true },
        },
        children: [{ type: 'detail-toolbar-action', dock: 'toolbar' }],
      },
      slots: {
        default: ({ row }: Record<string, unknown>) => h('div', {
          class: 'biz-detail-template',
          'data-title': String((row as Record<string, unknown>)['title'] ?? ''),
        }, 'biz-detail-template'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="detail-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.find('.biz-detail-template').attributes('data-title')).toBe('Detail Row')
  })
})