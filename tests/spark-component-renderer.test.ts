import { expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { SparkComponentRenderer, Spark, SPARK_REGISTRY_KEY } from '@spark-view/spark-component'
import { defineComponent, h } from 'vue'
import type { DefineComponent } from 'vue'
import SparkComponentRendererSource from '../packages/spark-component/src/components/SparkComponentRenderer.vue'

const { registry, rootContext } = Spark.createSystem()

test('SparkComponentRenderer forwards config.on listeners to rendered components', async () => {
  const ClickEmitter = defineComponent({
    emits: ['click'],
    setup(_, { emit }) {
      return () => h('button', { class: 'click-emitter', onClick: () => emit('click', 'payload') }, 'emit')
    }
  })
  registry.register('test-click-emitter', ClickEmitter)

  const clickSpy = vi.fn()
  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: {
      config: { type: 'test-click-emitter', props: { on: { click: clickSpy } } } as unknown as Record<string, unknown>,
      parentContext: rootContext
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  await wrapper.find('.click-emitter').trigger('click')
  expect(clickSpy).toHaveBeenCalledWith('payload')
})

test('SparkComponentRenderer falls back to Vue global Render* components', () => {
  const RenderSearchBar = defineComponent({
    name: 'RenderSearchBar',
    setup() {
      return () => h('div', { class: 'render-search-bar' }, 'search')
    }
  })

  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: {
      config: { type: 'RenderSearchBar' },
      parentContext: rootContext
    },
    global: {
      components: {
        RenderSearchBar
      },
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  expect(wrapper.find('.render-search-bar').exists()).toBe(true)
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(false)
})

test('SparkComponentRenderer resolves kebab-case el-* type from globally registered PascalCase components', () => {
  const ElButton = defineComponent({
    name: 'ElButton',
    setup() {
      return () => h('button', { class: 'el-button-stub' }, 'ok')
    }
  })

  const wrapper = mount(SparkComponentRendererSource as unknown as DefineComponent, {
    props: {
      config: { type: 'el-button' },
      parentContext: rootContext
    },
    global: {
      components: {
        ElButton
      },
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  expect(wrapper.find('.el-button-global-stub, .el-button-stub').exists()).toBe(true)
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(false)
})

test('SparkComponentRenderer renders children for Vue global el-* components via unified slot path', () => {
  const ElButton = defineComponent({
    name: 'ElButton',
    setup(_, { slots }) {
      return () => h('button', { class: 'el-button-slot-stub' }, slots['default']?.())
    }
  })

  const wrapper = mount(SparkComponentRendererSource as unknown as DefineComponent, {
    props: {
      config: {
        type: 'el-button',
        children: ['提交'],
      },
      parentContext: rootContext
    },
    global: {
      components: {
        ElButton
      },
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  expect(wrapper.find('.el-button-slot-stub, .el-button-global-stub').exists()).toBe(true)
  expect(wrapper.text()).toContain('提交')
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(false)
})

test('SparkComponentRenderer passes config props into Vue global Render* components', () => {
  const RenderRowAction = defineComponent({
    name: 'RenderRowAction',
    inheritAttrs: false,
    setup(_, { attrs }) {
      const row = attrs['row'] as { name?: string } | undefined
      return () => h('div', { class: 'render-row-action' }, row?.name ?? 'missing')
    }
  })

  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: {
      config: { type: 'RenderRowAction', props: { row: { name: '王晓明' } } },
      parentContext: rootContext
    },
    global: {
      components: {
        RenderRowAction
      },
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  expect(wrapper.find('.render-row-action').text()).toBe('王晓明')
})

test('SparkComponentRenderer applies onBeforeRender to Vue global third-party components', () => {
  const VendorButton = defineComponent({
    name: 'VendorButton',
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => h('button', {
        class: 'vendor-button-before-render',
        disabled: attrs['disabled'] === true,
        'data-disabled': String(attrs['disabled'] === true),
      }, slots['default']?.())
    }
  })

  const wrapper = mount(SparkComponentRendererSource as unknown as DefineComponent, {
    props: {
      config: {
        type: 'VendorButton',
        props: {
          onBeforeRender: () => ({ disabled: true }),
        },
        children: ['保存'],
      },
      parentContext: rootContext,
    },
    global: {
      components: {
        VendorButton,
      },
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  const button = wrapper.find('.vendor-button-before-render')
  expect(button.exists()).toBe(true)
  expect(button.attributes('data-disabled')).toBe('true')
  expect(button.text()).toContain('保存')
})

test('SparkComponentRenderer can hide Vue global third-party components through onBeforeRender', () => {
  const VendorButton = defineComponent({
    name: 'VendorButton',
    setup(_, { slots }) {
      return () => h('button', { class: 'vendor-button-hidden-target' }, slots['default']?.())
    }
  })

  const wrapper = mount(SparkComponentRendererSource as unknown as DefineComponent, {
    props: {
      config: {
        type: 'VendorButton',
        props: {
          onBeforeRender: () => false,
        },
        children: ['隐藏'],
      },
      parentContext: rootContext,
    },
    global: {
      components: {
        VendorButton,
      },
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  expect(wrapper.find('.vendor-button-hidden-target').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('隐藏')
})

test('SparkComponentRenderer only forwards config.props to registered components', () => {
  const RootFieldReader = defineComponent({
    props: {
      label: String,
      status: String,
      gridGap: Number,
    },
    setup(componentProps) {
      return () => h('div', {
        class: 'root-field-reader',
        'data-label': componentProps.label ?? '',
        'data-status': componentProps.status ?? '',
        'data-gap': String(componentProps.gridGap ?? ''),
      }, 'root')
    }
  })

  registry.register('root-field-reader', RootFieldReader)

  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: {
      config: {
        type: 'root-field-reader',
        props: {
          label: 'props 标签',
          status: 'active',
          gridGap: 18,
        },
      } as unknown as Record<string, unknown>,
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  const reader = wrapper.find('.root-field-reader')
  expect(reader.attributes('data-label')).toBe('props 标签')
  expect(reader.attributes('data-status')).toBe('active')
  expect(reader.attributes('data-gap')).toBe('18')
})

test('SparkComponentRenderer does not forward empty children prop to registered components', () => {
  const AttrReader = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs }) {
      return () => h('div', {
        class: 'registered-attr-reader',
        'data-has-children': String('children' in attrs),
      }, 'attr')
    }
  })

  registry.register('registered-attr-reader', AttrReader)

  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: {
      config: {
        type: 'registered-attr-reader',
      } as unknown as Record<string, unknown>,
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  expect(wrapper.find('.registered-attr-reader').attributes('data-has-children')).toBe('false')
})

test('SparkComponentRenderer auto mode forwards children prop to registered components that declare it', () => {
  const PropReader = defineComponent({
    props: {
      children: {
        type: Array,
        default: () => [],
      },
    },
    setup(componentProps) {
      return () => h('div', {
        class: 'registered-prop-reader',
        'data-children-count': String(componentProps.children.length),
      }, 'prop-reader')
    }
  })

  registry.register('registered-prop-reader', PropReader)

  const wrapper = mount(SparkComponentRendererSource as unknown as DefineComponent, {
    props: {
      config: {
        type: 'registered-prop-reader',
        children: ['prop-content'],
      },
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  expect(wrapper.find('.registered-prop-reader').exists()).toBe(true)
  expect(wrapper.find('.registered-prop-reader').attributes('data-children-count')).toBe('1')
  expect(wrapper.text()).not.toContain('prop-content')
})

test('SparkComponentRenderer renders registered components without children prop through unified slot path', () => {
  const SlotReader = defineComponent({
    inheritAttrs: false,
    setup(_, { slots }) {
      return () => h('section', { class: 'registered-slot-reader' }, slots['default']?.())
    }
  })

  registry.register('registered-slot-reader', SlotReader)

  const wrapper = mount(SparkComponentRendererSource as unknown as DefineComponent, {
    props: {
      config: {
        type: 'registered-slot-reader',
        children: ['slot-content'],
      },
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  expect(wrapper.find('.registered-slot-reader').exists()).toBe(true)
  expect(wrapper.text()).toContain('slot-content')
})

test('SparkComponentRenderer allows registry meta.childrenMode to force slot rendering', () => {
  const HybridReader = defineComponent({
    props: {
      children: {
        type: Array,
        default: () => [],
      },
    },
    setup(componentProps, { slots }) {
      return () => h('div', {
        class: 'registered-hybrid-reader',
        'data-prop-children-count': String(componentProps.children.length),
      }, slots['default']?.())
    }
  })

  registry.register('registered-hybrid-reader', HybridReader, { childrenMode: 'slot' })

  const wrapper = mount(SparkComponentRendererSource as unknown as DefineComponent, {
    props: {
      config: {
        type: 'registered-hybrid-reader',
        children: ['slot-forced-content'],
      },
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  const reader = wrapper.find('.registered-hybrid-reader')
  expect(reader.exists()).toBe(true)
  expect(reader.attributes('data-prop-children-count')).toBe('0')
  expect(wrapper.text()).toContain('slot-forced-content')
})

test('SparkComponentRenderer ignores root-level non-struct fields for registered components', () => {
  const RootFieldReader = defineComponent({
    props: {
      label: String,
      status: String,
      gridGap: Number,
    },
    setup(componentProps) {
      return () => h('div', {
        class: 'root-field-reader-ignored',
        'data-label': componentProps.label ?? '',
        'data-status': componentProps.status ?? '',
        'data-gap': String(componentProps.gridGap ?? ''),
      }, 'root')
    }
  })

  registry.register('root-field-reader-ignored', RootFieldReader)

  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: {
      config: {
        type: 'root-field-reader-ignored',
        label: '根级标签',
        status: 'active',
        gridGap: 18,
      } as unknown as Record<string, unknown>,
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  const reader = wrapper.find('.root-field-reader-ignored')
  expect(reader.attributes('data-label')).toBe('')
  expect(reader.attributes('data-status')).toBe('')
  expect(reader.attributes('data-gap')).toBe('')
})

test('SparkComponentRenderer renders unregistered native tags with recursive children', () => {
  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: {
      config: {
        type: 'div',
        props: { class: 'native-wrapper' },
        children: ['hello']
      } as unknown as Record<string, unknown>,
      parentContext: rootContext
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  expect(wrapper.find('.native-wrapper').exists()).toBe(true)
  expect(wrapper.text()).toContain('hello')
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(false)
})

test('SparkComponentRenderer preserves numeric literal children in unified slot rendering', () => {
  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: {
      config: {
        type: 'div',
        props: { class: 'native-wrapper-number' },
        children: [123],
      } as unknown as Record<string, unknown>,
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  expect(wrapper.find('.native-wrapper-number').exists()).toBe(true)
  expect(wrapper.text()).toContain('123')
})

test('SparkComponentRenderer does not forward $-prefixed scoped props to native elements', () => {
  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: {
      config: {
        type: 'button',
        props: {
          class: 'native-scoped-button',
          '$index': 3,
          rowIndex: 3,
        },
        children: ['action'],
      } as unknown as Record<string, unknown>,
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  const button = wrapper.find('.native-scoped-button')
  expect(button.exists()).toBe(true)
  expect(button.attributes('$index')).toBeUndefined()
  expect(button.text()).toContain('action')
})

test('SparkComponentRenderer does not forward scoped row props to native elements', () => {
  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: {
      config: {
        type: 'button',
        props: {
          class: 'native-row-button',
          row: { id: 'n-1', title: '节点' },
          rowIndex: 2,
          data: { id: 'n-1' },
        },
        children: ['action'],
      } as unknown as Record<string, unknown>,
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  const button = wrapper.find('.native-row-button')
  expect(button.exists()).toBe(true)
  expect(button.attributes('row')).toBeUndefined()
  expect(button.attributes('rowindex')).toBeUndefined()
  expect(button.attributes('data')).toBeUndefined()
})

test('SparkComponentRenderer still forwards scoped row props to Vue global components', () => {
  const RenderRowAction = defineComponent({
    name: 'RenderRowAction',
    inheritAttrs: false,
    setup(_, { attrs }) {
      const row = attrs['row'] as { title?: string } | undefined
      const rowIndex = attrs['rowIndex'] as number | undefined
      return () => h('div', { class: 'render-row-action-global' }, `${row?.title ?? 'missing'}-${String(rowIndex ?? '')}`)
    }
  })

  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: {
      config: {
        type: 'RenderRowAction',
        props: {
          row: { title: '工具栏' },
          rowIndex: 5,
        },
      },
      parentContext: rootContext,
    },
    global: {
      components: {
        RenderRowAction,
      },
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  expect(wrapper.find('.render-row-action-global').text()).toBe('工具栏-5')
})

test('SparkComponentRenderer keeps warning fallback for unknown non-native component types', () => {
  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: {
      config: { type: 'unknown-widget', children: [] },
      parentContext: rootContext
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(true)
})

test('SparkComponentRenderer fallback can expand node snapshot for unknown component types', async () => {
  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: {
      config: {
        type: 'unknown-widget',
        id: 'unknown-node-1',
        props: {
          title: '测试节点',
          visible: true,
        },
        children: [],
      },
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  await wrapper.find('.unregistered-details-button').trigger('click')

  const panel = wrapper.find('.unregistered-details-panel')
  expect(panel.exists()).toBe(true)
  expect(panel.text()).toContain('unknown-widget')
  expect(panel.text()).toContain('测试节点')
  expect(panel.text()).toContain('unknown-node-1')
})
