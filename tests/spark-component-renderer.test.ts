import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import SparkComponentRenderer from '../features/spark/components/SparkComponentRenderer.vue'
import { Spark, SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from '@spark-view/spark-component'
import { initializeSparkEJ2Components } from '../features/spark-ej2'
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
