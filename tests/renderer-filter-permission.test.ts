import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { DataView } from '@spark-view/spark-data'
import {
  DATA_SOURCE,
  FIELD_PERMISSION_POLICY,
  PAGE_PERMISSION_MODE,
  PAGE_RUNTIME_SERVICES,
  SPARK_REGISTRY_KEY,
  Spark,
  useSparkComponent,
  useSparkConsume,
} from '@spark-view/spark-component'
import RendererFilter from '../packages/spark-component/src/components/containers/zones/RendererFilter.vue'
import RendererFieldScope from '../packages/spark-component/src/components/containers/support/RendererFieldScope.vue'
import FieldText from '../packages/spark-component/src/components/fields/data-components/FieldText.vue'

function createFilterDataView(): DataView {
  const view = new DataView('orders', 'main')
  view.rows = []
  return view
}

const SparkComponentRendererProbe = defineComponent({
  name: 'SparkComponentRendererProbe',
  props: {
    config: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const { sparkConsume } = useSparkConsume()
    return () => h('div', {
      class: 'spark-renderer-probe',
      'data-config-type': Reflect.get(props.config, 'type'),
      'data-field-permission-policy': sparkConsume(FIELD_PERMISSION_POLICY) ?? 'missing',
      'data-page-permission-mode': sparkConsume(PAGE_PERMISSION_MODE) ?? 'missing',
    })
  },
})

const DataViewMetaBarStub = defineComponent({
  name: 'DataViewMetaBarStub',
  setup() {
    return () => h('div', { class: 'dataview-meta-bar-stub' })
  },
})

const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  setup(_, { slots }) {
    return () => h('button', slots['default']?.())
  },
})

const ElFormStub = defineComponent({
  name: 'ElFormStub',
  setup(_, { slots }) {
    return () => h('form', { class: 'el-form-stub' }, slots['default']?.())
  },
})

const ElFormItemStub = defineComponent({
  name: 'ElFormItemStub',
  setup(_, { slots }) {
    return () => h('label', { class: 'el-form-item-stub' }, slots['default']?.())
  },
})

const ElInputStub = defineComponent({
  name: 'ElInputStub',
  props: {
    modelValue: {
      type: [String, Number, Boolean],
      default: '',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    return () => h('input', {
      class: 'el-input-stub',
      disabled: props.disabled,
      value: String(props.modelValue ?? ''),
    })
  },
})

describe('RendererFilter permission boundary', () => {
  it('r-filter 独立子树也会绕开页面字段权限', () => {
    const { registry, rootContext } = Spark.createSystem()
    const view = createFilterDataView()

    const Host = defineComponent({
      name: 'RendererFilterPermissionHost',
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'spark-page' }, { parentContext: rootContext })
        sparkProvide(PAGE_PERMISSION_MODE, 'invisible')
        sparkProvide(DATA_SOURCE, view)
        sparkProvide(PAGE_RUNTIME_SERVICES, {
          logger: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          },
        })

        return () => h(RendererFilter, {
          type: 'r-filter',
          children: [
            {
              type: 'r-toolbar',
            },
          ],
        })
      },
    })

    const wrapper = mount(Host, {
      global: {
        provide: {
          [SPARK_REGISTRY_KEY]: registry,
        },
        stubs: {
          DataViewMetaBar: DataViewMetaBarStub,
          SparkComponentRenderer: SparkComponentRendererProbe,
          'el-button': ElButtonStub,
          'el-tag': true,
        },
      },
    })

    const probe = wrapper.get('.spark-renderer-probe')
    expect(probe.attributes('data-config-type')).toBe('r-toolbar')
    expect(probe.attributes('data-field-permission-policy')).toBe('unrestricted')
    expect(probe.attributes('data-page-permission-mode')).toBe('invisible')
  })

  it('r-filter 面板字段在页面无字段写权限时仍保持可写', async () => {
    const { registry, rootContext } = Spark.createSystem()
    registry.register('r-field-scope', RendererFieldScope)
    registry.register('r-text', FieldText)
    const view = createFilterDataView()

    const Host = defineComponent({
      name: 'RendererFilterWritableHost',
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'spark-page' }, { parentContext: rootContext })
        sparkProvide(PAGE_PERMISSION_MODE, 'invisible')
        sparkProvide(DATA_SOURCE, view)
        sparkProvide(PAGE_RUNTIME_SERVICES, {
          logger: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          },
        })

        return () => h(RendererFilter, {
          type: 'r-filter',
          children: [
            {
              type: 'r-text',
              props: {
                field: 'status',
              },
            },
          ],
        })
      },
    })

    const wrapper = mount(Host, {
      global: {
        provide: {
          [SPARK_REGISTRY_KEY]: registry,
        },
        stubs: {
          DataViewMetaBar: DataViewMetaBarStub,
          SparkComponentRenderer: false,
          'el-button': ElButtonStub,
          'el-form': ElFormStub,
          'el-form-item': ElFormItemStub,
          'el-input': ElInputStub,
          'el-tag': true,
        },
      },
    })

    await nextTick()

    const input = wrapper.get<HTMLInputElement>('.el-input-stub')
    expect(input.element.disabled).toBe(false)
  })
})
