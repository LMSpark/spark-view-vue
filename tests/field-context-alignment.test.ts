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
import { Spark, PAGE_COMPONENT_REGISTRY, FieldText, useSparkHostScope } from '@spark-view/spark-component'
import FieldContextRenderer from '../packages/spark-component/src/components/fields/non-data-components/FieldContextRenderer.vue'
import { useFieldContext } from '../packages/spark-component/src/components/fields/context/useFieldContext'
import { useResolvedFieldContext } from '../packages/spark-component/src/components/fields/context/useResolvedFieldContext'
import { useSparkComponent } from '../packages/spark-component/src/core/useSparkComponent'
import type { SparkNode } from '../packages/spark-component/src/core/types'
import { useDataScope } from '../packages/spark-component/src/components/containers/context/useDataScope'
import { createPageComponentRegistry } from '../packages/spark-component/src/page/context/page-component-registry'
import type { IDataRow } from '@spark-view/spark-data'
import { mountFieldInContext } from './helpers/mount-field-in-context'

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
  return mountFieldInContext({
    component: FieldContextRenderer,
    type: 'r-column-group',
    model: {},
    fieldName: 'id',
    parentType: 'r-table',
    componentProps: {
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
    },
    global: {
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
 * 集成测试：验证 useFieldContext 通过显式 props 读取对齐参数，
 * 并正确传递给 FieldContextRenderer。
 *
 * 链路：ParentWrapper[props] → FieldLikeComponent[props] → useFieldContext → FieldContextRenderer → el-table-column
 */
describe('useFieldContext attrs 集成传递', () => {
  // 模拟字段组件：显式声明 alignment props，通过 props 传递给 useFieldContext
  const FieldLikeStub = defineComponent({
    name: 'FieldLikeStub',
    props: {
      field: String, label: String, width: Number,
      titleAlign: String as () => 'left' | 'center' | 'right' | undefined,
      valueAlign: String as () => 'left' | 'center' | 'right' | undefined,
      headerCellClassName: String,
      cellClassName: String,
      titleClassName: String,
      valueClassName: String,
    },
    setup(props) {
      const permission = {
        fieldName: computed(() => props.field ?? 'id'),
        displayLabel: computed(() => props.label ?? 'ID'),
        isCurrentFieldHidden: computed(() => false),
        shouldRenderCurrentField: computed(() => true),
        currentDisplayValue: computed(() => '1'),
        isTableCellHidden: () => false,
        getTableCellDisplayValue: (row: IDataRow) => String((row as Record<string, unknown>)['id'] ?? ''),
        validationRules: computed(() => [] as never[]),
      }
      const fieldCtx = useFieldContext({
        type: 'r-text',
        width: props.width,
        ...(props.titleAlign !== undefined ? { titleAlign: props.titleAlign } : {}),
        ...(props.valueAlign !== undefined ? { valueAlign: props.valueAlign } : {}),
        ...(props.headerCellClassName !== undefined ? { headerCellClassName: props.headerCellClassName } : {}),
        ...(props.cellClassName !== undefined ? { cellClassName: props.cellClassName } : {}),
        ...(props.titleClassName !== undefined ? { titleClassName: props.titleClassName } : {}),
        ...(props.valueClassName !== undefined ? { valueClassName: props.valueClassName } : {}),
      }, permission)
      return () => h(FieldContextRenderer, fieldCtx.value)
    },
  })

  function mountFieldLike(fieldAttrs: Record<string, unknown>) {
    return mountFieldInContext({
      component: FieldLikeStub,
      type: 'r-text',
      model: {},
      fieldName: 'id',
      parentType: 'r-table',
      componentProps: {
        label: 'ID',
        width: 80,
        ...fieldAttrs,
      },
      global: {
        stubs: {
          'el-form-item': ElFormItemStub,
          'el-table-column': ElTableColumnStub,
          'SparkComponentRenderer': true,
        },
      },
    })
  }

  it('headerCellClassName 通过 props → useFieldContext → FieldContextRenderer', () => {
    const wrapper = mountFieldLike({ headerCellClassName: 'demo-col-header-center' })
    const col = wrapper.find('.el-table-column-test-stub')
    expect(col.attributes('data-label-class-name')).toBe('demo-col-header-center')
  })

  it('cellClassName 通过 props → useFieldContext → FieldContextRenderer', () => {
    const wrapper = mountFieldLike({ cellClassName: 'demo-col-cell-right' })
    const col = wrapper.find('.el-table-column-test-stub')
    expect(col.attributes('data-class-name')).toBe('demo-col-cell-right')
  })

  it('titleAlign + valueAlign 通过 props 传递', () => {
    const wrapper = mountFieldLike({ titleAlign: 'center', valueAlign: 'right' })
    const col = wrapper.find('.el-table-column-test-stub')
    expect(col.attributes('data-header-align')).toBe('center')
    expect(col.attributes('data-align')).toBe('right')
  })

  it('valueClassName 通过 props → span.field-table-value', () => {
    const wrapper = mountFieldLike({ valueClassName: 'demo-value-center' })
    const span = wrapper.find('span.field-table-value')
    expect(span.exists()).toBe(true)
    expect(span.classes()).toContain('demo-value-center')
  })
})

describe('字段宿主解析会考虑中间层', () => {
  const HostContextProbe = defineComponent({
    name: 'HostContextProbe',
    setup() {
      const resolvedContext = useResolvedFieldContext()
      return () => h('div', { 'data-host-context': resolvedContext.value })
    },
  })

  function createIntermediateBridge(intermediateType: string, next: object = HostContextProbe) {
    return defineComponent({
      name: `IntermediateBridge_${intermediateType}`,
      setup() {
        useSparkComponent({ type: intermediateType } as SparkNode)
        return () => h(next as never)
      },
    })
  }

  it('会跳过结构层插入的中间节点，继承最近宿主 fieldMode', () => {
    const SlotBridge = createIntermediateBridge('r-slot')

    const wrapper = mountFieldInContext({
      component: SlotBridge,
      type: 'r-slot',
      model: {},
      fieldName: 'id',
      parentType: 'r-table',
    })

    expect(wrapper.get('[data-host-context]').attributes('data-host-context')).toBe('table')
  })

  it('中间作用域节点不改写宿主 fieldMode', () => {
    const FieldScopeBridge = createIntermediateBridge('r-field-scope')

    const wrapper = mountFieldInContext({
      component: FieldScopeBridge,
      type: 'r-field-scope',
      model: {},
      fieldName: 'id',
      parentType: 'r-table',
    })

    expect(wrapper.get('[data-host-context]').attributes('data-host-context')).toBe('table')
  })

  it('会跨越多层中间组件解析到最近宿主 fieldMode', () => {
    const DataScopeBridge = createIntermediateBridge('r-data-scope')
    const ListItemBridge = createIntermediateBridge('r-list-item', DataScopeBridge)

    const wrapper = mountFieldInContext({
      component: ListItemBridge,
      type: 'r-list-item',
      model: {},
      fieldName: 'id',
      parentType: 'r-list',
    })

    expect(wrapper.get('[data-host-context]').attributes('data-host-context')).toBe('detail')
  })

  it('字段宿主解析不能污染页面注册表中的真实组件 type', () => {
    const registry = createPageComponentRegistry()
    const plugin = Spark.createPlugin({ registry: Spark.createRegistry() })

    const ScopeComp = defineComponent({
      props: {
        id: String,
      },
      setup(props) {
        useDataScope({
          type: 'r-field-scope',
          nodeConfig: {
            type: 'r-field-scope',
            ...(props.id !== undefined ? { id: props.id } : {}),
          },
          data: computed(() => ({ id: 1 })),
        })

        return () => h('div', { class: 'scope-comp' }, 'scope')
      },
    })

    const RootComp = defineComponent({
      setup() {
        const result = useSparkComponent({ type: 'root-comp' } as SparkNode)
        result.sparkProvide(PAGE_COMPONENT_REGISTRY, registry)
        return () => h(ScopeComp, { id: 'filter-scope' })
      },
    })

    mount(RootComp, {
      global: { plugins: [plugin] },
    })

    expect(registry.getInstance('filter-scope')?.type).toBe('r-field-scope')
  })

  it('原生 el-table 包装组件可通过 host scope 直接承载 r-text', () => {
    const ElTableStub = defineComponent({
      name: 'ElTable',
      setup(_, { slots }) {
        return () => h('div', { class: 'el-table-host-stub' }, slots['default']?.())
      },
    })

    const NativeTableWrapper = defineComponent({
      name: 'NativeTableWrapper',
      setup() {
        const hostScope = useSparkHostScope('r-table')
        hostScope.host.setHost({ fieldMode: 'table' })
        return () => h(ElTableStub, null, {
          default: () => h(FieldText as never, {
            type: 'r-text',
            field: 'name',
            label: '姓名',
          }),
        })
      },
    })

    const wrapper = mount(NativeTableWrapper, {
      global: {
        stubs: {
          'el-table-column': ElTableColumnStub,
          'el-form-item': ElFormItemStub,
          'el-input': true,
          'SparkComponentRenderer': true,
        },
      },
    })

    const col = wrapper.find('.el-table-column-test-stub')
    expect(col.exists()).toBe(true)
    expect(col.attributes('data-prop')).toBe('name')
    expect(col.attributes('data-label')).toBe('姓名')
  })
})
