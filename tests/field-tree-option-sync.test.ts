import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, reactive } from 'vue'
import {
  CONTEXT_DATA,
  FIELD_CONTEXT,
  FieldCascader,
  FieldTreeSelect,
  PAGE_DATASET,
  SPARK_REGISTRY_KEY,
  Spark,
  useSparkComponent,
} from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'

const { registry, rootContext } = Spark.createSystem()

const ElFormItemStub = defineComponent({
  props: ['label', 'prop', 'rules'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
  },
})

const ElTreeSelectStub = defineComponent({
  props: ['modelValue', 'data', 'disabled'],
  setup(props) {
    const rootNodes = Array.isArray(props.data) ? props.data : []
    const firstNode = rootNodes[0] as Record<string, unknown> | undefined
    const firstChildren = Array.isArray(firstNode?.['children']) ? firstNode['children'] as unknown[] : []
    return () => h('div', {
      class: 'el-tree-select-stub',
      'data-root-count': String(rootNodes.length),
      'data-first-label': String(firstNode?.['label'] ?? ''),
      'data-first-value': String(firstNode?.['value'] ?? ''),
      'data-first-children-count': String(firstChildren.length),
      'data-first-child-label': String((firstChildren[0] as Record<string, unknown> | undefined)?.['label'] ?? ''),
    })
  },
})

const ElCascaderStub = defineComponent({
  props: ['modelValue', 'options', 'props', 'disabled'],
  setup(componentProps) {
    const rootNodes = Array.isArray(componentProps.options) ? componentProps.options : []
    const firstNode = rootNodes[0] as Record<string, unknown> | undefined
    const firstChildren = Array.isArray(firstNode?.['children']) ? firstNode['children'] as unknown[] : []
    return () => h('div', {
      class: 'el-cascader-stub',
      'data-root-count': String(rootNodes.length),
      'data-first-label': String(firstNode?.['label'] ?? ''),
      'data-first-value': String(firstNode?.['value'] ?? ''),
      'data-first-children-count': String(firstChildren.length),
      'data-first-child-label': String((firstChildren[0] as Record<string, unknown> | undefined)?.['label'] ?? ''),
    })
  },
})

function createFlatTreeOptionDataSet() {
  return SparkData.createDataSet({
    dataSetName: 'TreeOptionDS',
    tables: {
      Categories: {
        tableName: 'Categories',
        columns: [
          { name: 'id', type: 'string' as const },
          { name: 'parentId', type: 'string' as const },
          { name: 'name', type: 'string' as const },
        ],
        rows: [
          { id: 'root-a', parentId: null, name: '根节点 A' },
          { id: 'child-a1', parentId: 'root-a', name: '子节点 A1' },
          { id: 'root-b', parentId: null, name: '根节点 B' },
        ],
        views: {
          default: {
            treeConfig: {
              idField: 'id',
              parentIdField: 'parentId',
              textField: 'name',
              treeMode: 'flat',
            },
          },
        },
      },
    },
  })
}

function mountTreeOptionField(
  component: unknown,
  type: 'r-tree-select' | 'r-cascader',
  fieldName: string,
) {
  const dataSet = createFlatTreeOptionDataSet()
  const model = reactive<Record<string, unknown>>({ [fieldName]: undefined })

  const Provider = defineComponent({
    setup() {
      const { sparkProvide } = useSparkComponent({ type: 'r-form' }, { parentContext: rootContext })
      sparkProvide(PAGE_DATASET, dataSet)
      sparkProvide(CONTEXT_DATA, model)
      sparkProvide(FIELD_CONTEXT, 'form')

      return () => h(component as never, {
        type,
        field: fieldName,
        optionKey: 'Categories@rows',
      })
    },
  })

  return mount(Provider, {
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      },
      stubs: {
        'el-form-item': ElFormItemStub,
        'el-tree-select': ElTreeSelectStub,
        'el-cascader': ElCascaderStub,
        'el-table-column': defineComponent({
          setup() {
            return () => h('div', { class: 'el-table-column-stub' })
          },
        }),
      },
    },
  })
}

describe('树选项字段同步 treeConfig 能力', () => {
  it('FieldTreeSelect 应从 flat rows + treeConfig 自动重建嵌套选项', () => {
    const wrapper = mountTreeOptionField(FieldTreeSelect as never, 'r-tree-select', 'categoryId')
    const treeSelect = wrapper.find('.el-tree-select-stub')

    expect(treeSelect.attributes('data-root-count')).toBe('2')
    expect(treeSelect.attributes('data-first-label')).toBe('根节点 A')
    expect(treeSelect.attributes('data-first-value')).toBe('root-a')
    expect(treeSelect.attributes('data-first-children-count')).toBe('1')
    expect(treeSelect.attributes('data-first-child-label')).toBe('子节点 A1')
  })

  it('FieldCascader 应从 flat rows + treeConfig 自动重建嵌套选项', () => {
    const wrapper = mountTreeOptionField(FieldCascader as never, 'r-cascader', 'categoryPath')
    const cascader = wrapper.find('.el-cascader-stub')

    expect(cascader.attributes('data-root-count')).toBe('2')
    expect(cascader.attributes('data-first-label')).toBe('根节点 A')
    expect(cascader.attributes('data-first-value')).toBe('root-a')
    expect(cascader.attributes('data-first-children-count')).toBe('1')
    expect(cascader.attributes('data-first-child-label')).toBe('子节点 A1')
  })
})