/**
 * 验证 FieldContextRenderer 的 CSS class 传递到 el-table-column。
 *
 * 重点：headerCellClassName → :label-class-name
 *       cellClassName → :class-name
 *       valueClassName → 内部 span.field-table-value 的 class
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, h } from 'vue'
import FieldContextRenderer from '../packages/spark-component/src/renderer/fields/FieldContextRenderer.vue'
import { useFieldContext } from '../packages/spark-component/src/renderer/fields/useFieldContext'
import type { IDataRow } from '@spark-view/spark-data'
import { SPARK_REGISTRY_KEY, Spark, useSparkComponent, FIELD_CONTEXT } from '@spark-view/spark-component'

const { registry, rootContext } = Spark.createSystem()

// el-table-column stub：将所有 props/attrs 输出到 data-* 属性，便于断言
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: {
    label: String,
    prop: String,
    width: [Number, String],
    headerAlign: String,
    align: String,
    labelClassName: String,
    className: String,
    fixed: [Boolean, String],
  },
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-table-column-test-stub',
      'data-label': props.label ?? '',
      'data-prop': props.prop ?? '',
      'data-header-align': props.headerAlign ?? '',
      'data-align': props.align ?? '',
      'data-label-class-name': props.labelClassName ?? '',
      'data-class-name': props.className ?? '',
    }, slots['default']?.({ row: { id: 1, name: 'Test' } as IDataRow, $index: 0 }))
  },
})

const ElFormItemStub = defineComponent({
  props: ['label', 'prop', 'rules'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
  },
})

const noop = () => false

function mountFCR(overrides: Record<string, unknown> = {}) {
  const Provider = defineComponent({
    setup() {
      const { sparkProvide } = useSparkComponent({ type: 'r-table' }, { parentContext: rootContext })
      sparkProvide(FIELD_CONTEXT, 'table')
      return () => h(FieldContextRenderer, {
        type: 'r-column-group',
        displayLabel: 'ID',
        fieldName: 'id',
        width: 80,
        mergedChildren: [],
        isCurrentFieldHidden: false,
        currentDisplayValue: '1',
        isTableCellHidden: noop as (row: IDataRow) => boolean,
        getTableCellDisplayValue: ((row: IDataRow) => String((row as Record<string, unknown>)['id'] ?? '')) as (row: IDataRow) => string,
        validationRules: [],
        ...overrides,
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
        'el-table-column': ElTableColumnStub,
        'SparkComponentRenderer': true,
      },
    },
  })
}

describe('FieldContextRenderer CSS class 传递', () => {
  it('headerCellClassName → el-table-column label-class-name', () => {
    const wrapper = mountFCR({
      headerCellClassName: 'demo-col-header-center',
    })
    const col = wrapper.find('.el-table-column-test-stub')
    expect(col.exists()).toBe(true)
    expect(col.attributes('data-label-class-name')).toBe('demo-col-header-center')
  })

  it('cellClassName → el-table-column class-name', () => {
    const wrapper = mountFCR({
      cellClassName: 'demo-col-cell-right',
    })
    const col = wrapper.find('.el-table-column-test-stub')
    expect(col.attributes('data-class-name')).toBe('demo-col-cell-right')
  })

  it('valueClassName → span.field-table-value 的 class', () => {
    const wrapper = mountFCR({
      valueClassName: 'demo-value-center',
    })
    const span = wrapper.find('span.field-table-value')
    expect(span.exists()).toBe(true)
    expect(span.classes()).toContain('demo-value-center')
  })

  it('titleAlign → header-align, valueAlign → align', () => {
    const wrapper = mountFCR({
      titleAlign: 'center',
      valueAlign: 'right',
    })
    const col = wrapper.find('.el-table-column-test-stub')
    expect(col.attributes('data-header-align')).toBe('center')
    expect(col.attributes('data-align')).toBe('right')
  })

  it('无 headerCellClassName 时 fallback 到 spark-col-header--left', () => {
    const wrapper = mountFCR({})
    const col = wrapper.find('.el-table-column-test-stub')
    expect(col.attributes('data-label-class-name')).toBe('spark-col-header--left')
  })

  it('无 cellClassName 时 fallback 到 spark-col-cell--left', () => {
    const wrapper = mountFCR({})
    const col = wrapper.find('.el-table-column-test-stub')
    expect(col.attributes('data-class-name')).toBe('spark-col-cell--left')
  })

  it('titleAlign=right 且无 headerCellClassName → fallback spark-col-header--right', () => {
    const wrapper = mountFCR({ titleAlign: 'right' })
    const col = wrapper.find('.el-table-column-test-stub')
    expect(col.attributes('data-label-class-name')).toBe('spark-col-header--right')
  })
})

/**
 * 集成测试：验证 useFieldContext 通过 useAttrs() 从父组件 attrs 读取对齐参数，
 * 并正确传递给 FieldContextRenderer。
 *
 * 链路：ParentWrapper[attrs] → FieldLikeComponent[useAttrs()] → useFieldContext → FieldContextRenderer → el-table-column
 */
describe('useFieldContext attrs 集成传递', () => {
  // 模拟字段组件：不声明 alignment props，通过 useAttrs 读取
  const FieldLikeStub = defineComponent({
    name: 'FieldLikeStub',
    props: { field: String, label: String, width: Number },
    inheritAttrs: false,
    setup(props) {
      const permission = {
        fieldName: computed(() => props.field ?? 'id'),
        displayLabel: computed(() => props.label ?? 'ID'),
        isCurrentFieldHidden: computed(() => false),
        currentDisplayValue: computed(() => '1'),
        isTableCellHidden: () => false,
        getTableCellDisplayValue: (row: IDataRow) => String((row as Record<string, unknown>)['id'] ?? ''),
        validationRules: computed(() => [] as never[]),
      }
      const fieldCtx = useFieldContext({ type: 'r-text', width: props.width }, permission)
      return () => h(FieldContextRenderer, fieldCtx.value)
    },
  })

  function mountFieldLike(fieldAttrs: Record<string, unknown>) {
    const Provider = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'r-table' }, { parentContext: rootContext })
        sparkProvide(FIELD_CONTEXT, 'table')
        return () => h(FieldLikeStub, {
          field: 'id',
          label: 'ID',
          width: 80,
          ...fieldAttrs,
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
          'el-table-column': ElTableColumnStub,
          'SparkComponentRenderer': true,
        },
      },
    })
  }

  it('headerCellClassName 通过 attrs → useFieldContext → FieldContextRenderer', () => {
    const wrapper = mountFieldLike({ headerCellClassName: 'demo-col-header-center' })
    const col = wrapper.find('.el-table-column-test-stub')
    expect(col.attributes('data-label-class-name')).toBe('demo-col-header-center')
  })

  it('cellClassName 通过 attrs → useFieldContext → FieldContextRenderer', () => {
    const wrapper = mountFieldLike({ cellClassName: 'demo-col-cell-right' })
    const col = wrapper.find('.el-table-column-test-stub')
    expect(col.attributes('data-class-name')).toBe('demo-col-cell-right')
  })

  it('kebab-case attrs (header-cell-class-name) 同样被识别', () => {
    const wrapper = mountFieldLike({ 'header-cell-class-name': 'demo-col-header-center' })
    const col = wrapper.find('.el-table-column-test-stub')
    expect(col.attributes('data-label-class-name')).toBe('demo-col-header-center')
  })

  it('titleAlign + valueAlign 通过 attrs 传递', () => {
    const wrapper = mountFieldLike({ titleAlign: 'center', valueAlign: 'right' })
    const col = wrapper.find('.el-table-column-test-stub')
    expect(col.attributes('data-header-align')).toBe('center')
    expect(col.attributes('data-align')).toBe('right')
  })

  it('valueClassName 通过 attrs → span.field-table-value', () => {
    const wrapper = mountFieldLike({ valueClassName: 'demo-value-center' })
    const span = wrapper.find('span.field-table-value')
    expect(span.exists()).toBe(true)
    expect(span.classes()).toContain('demo-value-center')
  })
})
