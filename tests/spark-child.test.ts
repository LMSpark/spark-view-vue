import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { DefineComponent, PropType } from 'vue'
import {
  Spark,
  SPARK_REGISTRY_KEY,
  SparkChild,
} from '@spark-view/spark-component'
import type { SparkNode, SparkNodeChildren } from '@spark-view/spark-component'

describe('SparkChild', () => {
  it('uses canonical id and preserves nested child ids through prop-children registry path', () => {
    const { registry } = Spark.createSystem()

    const PropCapture = defineComponent({
      name: 'SparkChildPropCapture',
      props: {
        id: {
          type: String,
          default: '',
        },
        children: {
          type: Array as PropType<SparkNodeChildren>,
          default: () => [],
        },
      },
      setup(componentProps) {
        const firstChild = componentProps.children[0] as SparkNode | undefined
        const secondChild = componentProps.children[1] as SparkNode | undefined
        return () => h('div', {
          class: 'spark-child-prop-capture',
          'data-id': componentProps.id,
          'data-child-id': firstChild?.id ?? '',
          'data-second-child-id': secondChild?.id ?? '',
        }, 'capture')
      },
    })

    registry.register('spark-child-prop-capture', PropCapture)

    const wrapper = mount(SparkChild as unknown as DefineComponent, {
      props: {
        type: 'spark-child-prop-capture',
        id: 'root-1',
      },
      slots: {
        default: () => [
          h(SparkChild as unknown as DefineComponent, {
            type: 'child-node',
            id: 'child-1',
          }),
          h(SparkChild as unknown as DefineComponent, {
            type: 'legacy-child-node',
            nodeId: 'child-2',
          }),
        ],
      },
      global: {
        provide: {
          [SPARK_REGISTRY_KEY as symbol]: registry,
        },
        stubs: {
          SparkComponentRenderer: false,
          'spark-component-renderer': false,
        },
      },
    })

    const capture = wrapper.find('.spark-child-prop-capture')
    expect(capture.exists()).toBe(true)
    expect(capture.attributes('data-id')).toBe('root-1')
    expect(capture.attributes('data-child-id')).toBe('child-1')
    expect(capture.attributes('data-second-child-id')).toBe('child-2')
  })

  it('does not forward direct template slot when registry component consumes children prop', () => {
    const { registry } = Spark.createSystem()

    const PropAndSlotProbe = defineComponent({
      name: 'SparkChildPropAndSlotProbe',
      props: {
        children: {
          type: Array as PropType<SparkNodeChildren>,
          default: () => [],
        },
      },
      setup(componentProps, { slots }) {
        return () => h('div', {
          class: 'spark-child-prop-and-slot-probe',
          'data-prop-children-count': String(componentProps.children.length),
          'data-slot-rendered': String((slots['default']?.().length ?? 0) > 0),
        }, slots['default']?.())
      },
    })

    registry.register('spark-child-prop-and-slot-probe', PropAndSlotProbe)

    const wrapper = mount(SparkChild as unknown as DefineComponent, {
      props: {
        type: 'spark-child-prop-and-slot-probe',
      },
      slots: {
        default: () => [
          h(SparkChild as unknown as DefineComponent, {
            type: 'nested-prop-child',
            id: 'nested-prop-child-id',
          }),
        ],
      },
      global: {
        provide: {
          [SPARK_REGISTRY_KEY as symbol]: registry,
        },
        stubs: {
          SparkComponentRenderer: false,
          'spark-component-renderer': false,
        },
      },
    })

    const probe = wrapper.find('.spark-child-prop-and-slot-probe')
    expect(probe.exists()).toBe(true)
    expect(probe.attributes('data-prop-children-count')).toBe('1')
    expect(probe.attributes('data-slot-rendered')).toBe('false')
  })

  it('builds nested SparkNode trees from declarative child components', () => {
    const { registry } = Spark.createSystem()

    const TreeProbe = defineComponent({
      name: 'SparkChildTreeProbe',
      props: {
        label: {
          type: String,
          default: '',
        },
        children: {
          type: Array as PropType<SparkNodeChildren>,
          default: () => [],
        },
      },
      setup(componentProps) {
        return () => {
          const firstChild = componentProps.children[0] as SparkNode | undefined
          const firstChildProps = (firstChild?.props ?? {}) as Record<string, unknown>
          const grandChild = Array.isArray(firstChild?.children) ? firstChild.children[0] as SparkNode | undefined : undefined
          const grandChildProps = (grandChild?.props ?? {}) as Record<string, unknown>

          return h('div', {
            class: 'spark-child-tree-probe',
            'data-label': componentProps.label,
            'data-child-count': String(componentProps.children.length),
            'data-child-type': firstChild?.type ?? '',
            'data-child-title': String(firstChildProps['title'] ?? ''),
            'data-grandchild-type': grandChild?.type ?? '',
            'data-grandchild-field': String(grandChildProps['field'] ?? ''),
          }, 'tree-probe')
        }
      },
    })

    registry.register('spark-child-tree-probe', TreeProbe)

    const wrapper = mount(SparkChild as unknown as DefineComponent, {
      props: {
        type: 'spark-child-tree-probe',
        label: '基础信息',
      } as unknown as Record<string, unknown>,
      slots: {
        default: () => [
          h(SparkChild as unknown as DefineComponent, {
            type: 'r-form',
            title: '表单容器',
          } as unknown as Record<string, unknown>, {
            default: () => [
              h(SparkChild as unknown as DefineComponent, {
                type: 'r-text',
                field: 'name',
                label: '名称',
              } as unknown as Record<string, unknown>),
            ],
          }),
        ],
      },
      global: {
        provide: {
          [SPARK_REGISTRY_KEY as symbol]: registry,
        },
        stubs: {
          SparkComponentRenderer: false,
          'spark-component-renderer': false,
        },
      },
    })

    const probe = wrapper.find('.spark-child-tree-probe')
    expect(probe.exists()).toBe(true)
    expect(probe.attributes('data-label')).toBe('基础信息')
    expect(probe.attributes('data-child-count')).toBe('1')
    expect(probe.attributes('data-child-type')).toBe('r-form')
    expect(probe.attributes('data-child-title')).toBe('表单容器')
    expect(probe.attributes('data-grandchild-type')).toBe('r-text')
    expect(probe.attributes('data-grandchild-field')).toBe('name')
  })

  it('wraps rendered output with grid span styles', () => {
    const { registry } = Spark.createSystem()

    const LeafProbe = defineComponent({
      name: 'SparkChildLeafProbe',
      setup() {
        return () => h('div', { class: 'spark-child-leaf-probe' }, 'leaf-probe')
      },
    })

    registry.register('spark-child-leaf-probe', LeafProbe)

    const wrapper = mount(SparkChild as unknown as DefineComponent, {
      props: {
        type: 'spark-child-leaf-probe',
        colSpan: 8,
        rowSpan: 2,
      },
      global: {
        provide: {
          [SPARK_REGISTRY_KEY as symbol]: registry,
        },
        stubs: {
          SparkComponentRenderer: false,
          'spark-component-renderer': false,
        },
      },
    })

    const gridItem = wrapper.find('.spark-child-grid-item')
    expect(gridItem.exists()).toBe(true)
    expect(gridItem.attributes('style')).toContain('grid-column: span 8 / span 8;')
    expect(gridItem.attributes('style')).toContain('grid-row: span 2 / span 2;')
    expect(gridItem.find('.spark-child-leaf-probe').exists()).toBe(true)
  })

  it('accepts strict integer string spans and rejects partial numeric strings', () => {
    const { registry } = Spark.createSystem()

    const LeafProbe = defineComponent({
      name: 'SparkChildStringSpanProbe',
      setup() {
        return () => h('div', { class: 'spark-child-string-span-probe' }, 'leaf-probe')
      },
    })

    registry.register('spark-child-string-span-probe', LeafProbe)

    const stringSpanWrapper = mount(SparkChild as unknown as DefineComponent, {
      props: {
        type: 'spark-child-string-span-probe',
        colSpan: '8',
        rowSpan: '2',
      },
      global: {
        provide: {
          [SPARK_REGISTRY_KEY as symbol]: registry,
        },
        stubs: {
          SparkComponentRenderer: false,
          'spark-component-renderer': false,
        },
      },
    })

    const strictGridItem = stringSpanWrapper.find('.spark-child-grid-item')
    expect(strictGridItem.exists()).toBe(true)
    expect(strictGridItem.attributes('style')).toContain('grid-column: span 8 / span 8;')
    expect(strictGridItem.attributes('style')).toContain('grid-row: span 2 / span 2;')

    const invalidSpanWrapper = mount(SparkChild as unknown as DefineComponent, {
      props: {
        type: 'spark-child-string-span-probe',
        colSpan: '8px',
        rowSpan: '2.5',
      },
      global: {
        provide: {
          [SPARK_REGISTRY_KEY as symbol]: registry,
        },
        stubs: {
          SparkComponentRenderer: false,
          'spark-component-renderer': false,
        },
      },
    })

    expect(invalidSpanWrapper.find('.spark-child-grid-item').exists()).toBe(false)
    expect(invalidSpanWrapper.find('.spark-child-string-span-probe').exists()).toBe(true)
  })

  it('preserves meaningful text slot children for slot-rendered components', () => {
    const { registry } = Spark.createSystem()

    const SlotProbe = defineComponent({
      name: 'SparkChildSlotProbe',
      setup(_, { slots }) {
        return () => h('button', { class: 'spark-child-slot-probe' }, slots['default']?.())
      },
    })

    registry.register('spark-child-slot-probe', SlotProbe)

    const wrapper = mount(SparkChild as unknown as DefineComponent, {
      props: {
        type: 'spark-child-slot-probe',
      },
      slots: {
        default: () => ['提交'],
      },
      global: {
        provide: {
          [SPARK_REGISTRY_KEY as symbol]: registry,
        },
        stubs: {
          SparkComponentRenderer: false,
          'spark-component-renderer': false,
        },
      },
    })

    const button = wrapper.find('.spark-child-slot-probe')
    expect(button.exists()).toBe(true)
    expect(button.text()).toBe('提交')
  })

  it('compiles default slot content into SparkNode children even for slot-rendered components', () => {
    const ConfigCaptureRenderer = defineComponent({
      name: 'SparkChildSlotConfigCaptureRenderer',
      props: {
        config: {
          type: Object as PropType<SparkNode>,
          required: true,
        },
      },
      setup(componentProps) {
        return () => h('div', {
          class: 'spark-child-slot-config-capture',
          'data-config': JSON.stringify(componentProps.config),
        }, 'capture')
      },
    })

    const wrapper = mount(SparkChild as unknown as DefineComponent, {
      props: {
        type: 'slot-only-node',
      },
      slots: {
        default: () => [
          '提交',
          h(SparkChild as unknown as DefineComponent, {
            type: 'slot-child-node',
            id: 'slot-child-id',
          }),
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: ConfigCaptureRenderer,
          'spark-component-renderer': ConfigCaptureRenderer,
        },
      },
    })

    const capture = wrapper.find('.spark-child-slot-config-capture')
    expect(capture.exists()).toBe(true)

    const serializedConfig = capture.attributes('data-config')
    expect(serializedConfig).toBeTruthy()
    const config = JSON.parse(serializedConfig ?? '{}') as SparkNode
    const firstChild = Array.isArray(config.children) ? config.children[0] : undefined
    const secondChild = Array.isArray(config.children) ? config.children[1] : undefined

    expect(Array.isArray(config.children)).toBe(true)
    expect(firstChild).toBe('提交')
    expect(secondChild).toEqual(expect.objectContaining({
      type: 'slot-child-node',
      id: 'slot-child-id',
    }))
  })

  it('renders nested SparkChild through compiled children path for slot-mode components', () => {
    const { registry } = Spark.createSystem()

    const SlotContainer = defineComponent({
      name: 'SparkChildTemplateSlotContainer',
      setup(_, { slots }) {
        return () => h('section', { class: 'spark-child-template-slot-container' }, slots['default']?.())
      },
    })

    const SlotLeaf = defineComponent({
      name: 'SparkChildTemplateSlotLeaf',
      setup() {
        return () => h('div', { class: 'spark-child-template-slot-leaf' }, 'leaf')
      },
    })

    registry.register('spark-child-template-slot-container', SlotContainer, { childrenMode: 'slot' })
    registry.register('spark-child-template-slot-leaf', SlotLeaf)

    const wrapper = mount(SparkChild as unknown as DefineComponent, {
      props: {
        type: 'spark-child-template-slot-container',
      },
      slots: {
        default: () => [
          h(SparkChild as unknown as DefineComponent, {
            type: 'spark-child-template-slot-leaf',
          }),
        ],
      },
      global: {
        provide: {
          [SPARK_REGISTRY_KEY as symbol]: registry,
        },
        stubs: {
          SparkComponentRenderer: false,
          'spark-component-renderer': false,
        },
      },
    })

    expect(wrapper.find('.spark-child-template-slot-container').exists()).toBe(true)
    expect(wrapper.find('.spark-child-template-slot-leaf').exists()).toBe(true)
  })

  it('ignores legacy props.children input and warns once', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const ConfigCaptureRenderer = defineComponent({
      name: 'SparkChildConflictCaptureRenderer',
      props: {
        config: {
          type: Object as PropType<SparkNode>,
          required: true,
        },
      },
      setup(componentProps) {
        return () => h('div', {
          class: 'spark-child-conflict-capture',
          'data-config': JSON.stringify(componentProps.config),
        }, 'capture')
      },
    })

    const wrapper = mount(SparkChild as unknown as DefineComponent, {
      props: {
        type: 'legacy-children-node',
        children: [{ type: 'prop-child' }],
      },
      global: {
        stubs: {
          SparkComponentRenderer: ConfigCaptureRenderer,
          'spark-component-renderer': ConfigCaptureRenderer,
        },
      },
    })

    const capture = wrapper.find('.spark-child-conflict-capture')
    expect(capture.exists()).toBe(true)

    const serializedConfig = capture.attributes('data-config')
    expect(serializedConfig).toBeTruthy()
    const config = JSON.parse(serializedConfig ?? '{}') as SparkNode

    expect(config.children).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(
      '[SparkChild] legacy-children-node 不再支持 props.children。 请改用默认 slot 声明子节点；当前 children 输入已忽略。'
    )

    warnSpy.mockRestore()
  })

  it('warns for non-array legacy children input as well', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const ConfigCaptureRenderer = defineComponent({
      name: 'SparkChildLegacyStringChildrenRenderer',
      props: {
        config: {
          type: Object as PropType<SparkNode>,
          required: true,
        },
      },
      setup(componentProps) {
        return () => h('div', {
          class: 'spark-child-legacy-string-children-capture',
          'data-config': JSON.stringify(componentProps.config),
        }, 'capture')
      },
    })

    const wrapper = mount(SparkChild as unknown as DefineComponent, {
      props: {
        type: 'legacy-string-children-node',
        children: '旧字符串子节点',
      } as unknown as Record<string, unknown>,
      global: {
        stubs: {
          SparkComponentRenderer: ConfigCaptureRenderer,
          'spark-component-renderer': ConfigCaptureRenderer,
        },
      },
    })

    const capture = wrapper.find('.spark-child-legacy-string-children-capture')
    expect(capture.exists()).toBe(true)

    const serializedConfig = capture.attributes('data-config')
    expect(serializedConfig).toBeTruthy()
    const config = JSON.parse(serializedConfig ?? '{}') as SparkNode

    expect(config.children).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(
      '[SparkChild] legacy-string-children-node 不再支持 props.children。 请改用默认 slot 声明子节点；当前 children 输入已忽略。'
    )

    warnSpy.mockRestore()
  })
})