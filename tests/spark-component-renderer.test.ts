import { expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { SparkComponentRenderer, Spark, SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from '@spark-view/spark-component'
import { initializeSparkEJ2Components } from '../src/features/spark-ej2'
import { defineComponent, h } from 'vue'
import type { DefineComponent } from 'vue'

const { registry, rootContext } = Spark.createSystem()

test('SparkComponentRenderer mounts spark-ej2-grid without missing render', async () => {
  // Register EJ2 components into the isolated registry
  initializeSparkEJ2Components(registry)

  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: {
      config: { type: 'spark-ej2-grid', children: [] },
      parentContext: rootContext
    },
    global: {
      stubs: {
        SparkComponentRenderer: false,
        'spark-component-renderer': false,
      },
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
        [SPARK_PARENT_CONTEXT_KEY as symbol]: rootContext
      }
    }
  })

  // Ensure component is resolved and not the unregistered fallback
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(false)
})

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
      config: { type: 'test-click-emitter', on: { click: clickSpy } } as unknown as Record<string, unknown>,
      parentContext: rootContext
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
        [SPARK_PARENT_CONTEXT_KEY as symbol]: rootContext
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
        [SPARK_PARENT_CONTEXT_KEY as symbol]: rootContext
      }
    }
  })

  expect(wrapper.find('.render-search-bar').exists()).toBe(true)
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
        [SPARK_PARENT_CONTEXT_KEY as symbol]: rootContext
      }
    }
  })

  expect(wrapper.find('.render-row-action').text()).toBe('王晓明')
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
        [SPARK_PARENT_CONTEXT_KEY as symbol]: rootContext
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
        [SPARK_PARENT_CONTEXT_KEY as symbol]: rootContext
      }
    }
  })

  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(true)
})
