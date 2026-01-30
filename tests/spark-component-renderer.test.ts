import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import SparkComponentRenderer from '../features/spark/components/SparkComponentRenderer.vue'
import { Spark, createComponentManager, createComponentRegistry } from '@spark-view/spark-core'
import { initializeAppSparkComponents } from '../features/spark/initialize'

const registry = createComponentRegistry()
const manager = createComponentManager(undefined, registry)

test('SparkComponentRenderer mounts spark-ej2-grid without missing render', async () => {
  // Explicitly pass manager to avoid implicit singletons
  await initializeAppSparkComponents(manager)
  const wrapper = mount(SparkComponentRenderer as any, {
    props: { config: { type: 'spark-ej2-grid', children: [] } },
    global: { provide: { sparkManager: manager, sparkRegistry: registry } }
  })
  // Ensure component is resolved and not the unregistered fallback
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(false)
})