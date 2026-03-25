import { describe, it, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { RendererForm, RendererDetail } from '@spark-view/spark-component'
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

const ElFormStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-stub' }, slots['default']?.())
  },
})

describe('RendererForm and RendererDetail toolbar integration', () => {
  it('should render docked form toolbar children and default slot scopes', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'FormDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          rows: [{ id: 1, name: 'Alice' }],
        },
      },
    })
    const formView = ds.getView('Users', 'default')!
    formView.selection.setCurrentRow(formView.rows[0] ?? null)
    ;(formView as typeof formView & { _modelPerm?: Record<string, unknown> })._modelPerm = { allowCreate: true }

    const wrapper = mountWithPageDataSet(RendererForm as any, {
      dataSet: ds,
      props: {
        dataKey: 'Users@currentRow',
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
    const ds = SparkData.createDataSet({
      dataSetName: 'DetailDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'title', type: 'string' as const },
          ],
          rows: [{ id: 2, title: 'Detail Row' }],
        },
      },
    })
    const detailView = ds.getView('Users', 'default')!
    detailView.selection.setCurrentRow(detailView.rows[0] ?? null)
    ;(detailView as typeof detailView & { _modelPerm?: Record<string, unknown> })._modelPerm = { allowExport: true }

    const wrapper = mountWithPageDataSet(RendererDetail as any, {
      dataSet: ds,
      props: {
        dataKey: 'Users@currentRow',
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