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
  it('should allow form toolbar slot and default slot scopes', () => {
    const wrapper = mount(RendererForm as any, {
      props: {
        dataView: {
          currentRow: { id: 1, name: 'Alice' },
          _modelPerm: { allowCreate: true },
        },
        toolbar: [{ type: 'form-toolbar-action' }],
      },
      slots: {
        toolbar: ({ row, modelPermission }: Record<string, unknown>) => h('button', {
          class: 'biz-form-toolbar',
          'data-row-id': String((row as Record<string, unknown>)['id'] ?? ''),
          'data-can-create': String((modelPermission as Record<string, unknown>)['allowCreate'] ?? ''),
        }, 'biz-form-toolbar'),
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
    expect(wrapper.find('.biz-form-toolbar').attributes('data-row-id')).toBe('1')
    expect(wrapper.find('.biz-form-toolbar').attributes('data-can-create')).toBe('true')
    expect(wrapper.find('.biz-form-template').attributes('data-name')).toBe('Alice')
  })

  it('should allow detail toolbar slot and default slot scopes', () => {
    const wrapper = mount(RendererDetail as any, {
      props: {
        dataView: {
          currentRow: { id: 2, title: 'Detail Row' },
          _modelPerm: { allowExport: true },
        },
        toolbar: [{ type: 'detail-toolbar-action' }],
      },
      slots: {
        toolbar: ({ row, modelPermission }: Record<string, unknown>) => h('button', {
          class: 'biz-detail-toolbar',
          'data-row-id': String((row as Record<string, unknown>)['id'] ?? ''),
          'data-can-export': String((modelPermission as Record<string, unknown>)['allowExport'] ?? ''),
        }, 'biz-detail-toolbar'),
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
    expect(wrapper.find('.biz-detail-toolbar').attributes('data-row-id')).toBe('2')
    expect(wrapper.find('.biz-detail-toolbar').attributes('data-can-export')).toBe('true')
    expect(wrapper.find('.biz-detail-template').attributes('data-title')).toBe('Detail Row')
  })
})