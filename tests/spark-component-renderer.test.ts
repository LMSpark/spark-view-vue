import { expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SparkComponentRenderer from '../packages/spark-component/src/renderer/spark/SparkComponentRenderer.vue'
import { Spark } from '../packages/spark-component/src/spark'
import { SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from '../packages/spark-component/src/core/types'
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
