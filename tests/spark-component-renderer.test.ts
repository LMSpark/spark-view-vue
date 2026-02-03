import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import SparkComponentRenderer from '../features/spark/components/SparkComponentRenderer.vue'
import { createComponentManager, createComponentRegistry } from '@spark-view/spark-component'
import { initializeSparkEJ2Components } from '../features/spark-ej2'
import type { DefineComponent } from 'vue'

const registry = createComponentRegistry()
const manager = createComponentManager(undefined, registry)

test('SparkComponentRenderer mounts spark-ej2-grid without missing render', async () => {
  // Explicitly pass manager to avoid implicit singletons
  await initializeSparkEJ2Components(manager)
  const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
    props: { config: { type: 'spark-ej2-grid', children: [] } },
    global: { provide: { sparkManager: manager, sparkRegistry: registry } }
  })
  // Ensure component is resolved and not the unregistered fallback
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(false)
})