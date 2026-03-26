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
