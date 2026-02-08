import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SparkComponentRenderer from '../features/spark/components/SparkComponentRenderer.vue'
import { Spark, SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from '@spark-view/spark-component'
import { h } from 'vue'
import type { DefineComponent } from 'vue'

describe('EJ2 SparkComponentRenderer (registry-driven)', () => {
  it('renders registered component for type', () => {
    const { registry, rootContext } = Spark.createSystem()
    // Register a simple component — just the component itself, not metadata
    registry.register('registered-type', { render() { return h('div', { class: 'registered-comp' }, 'ok') } })

    const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
      props: {
        config: { type: 'registered-type', children: [] },
        parentContext: rootContext
      },
      global: {
        provide: {
          [SPARK_REGISTRY_KEY as symbol]: registry,
          [SPARK_PARENT_CONTEXT_KEY as symbol]: rootContext
        }
      }
    })

    expect(wrapper.find('.registered-comp').exists()).toBe(true)
  })

  it('recurses into children when not registered', () => {
    const { registry, rootContext } = Spark.createSystem()
    // Register only child type
    registry.register('child-type', { render() { return h('span', { class: 'child' }, 'c') } })

    const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
      props: {
        config: { type: 'unknown', children: [{ type: 'child-type' }] },
        parentContext: rootContext
      },
      global: {
        provide: {
          [SPARK_REGISTRY_KEY as symbol]: registry,
          [SPARK_PARENT_CONTEXT_KEY as symbol]: rootContext
        }
      }
    })

    expect(wrapper.find('.child').exists()).toBe(true)
  })

  it('shows error when not registered and no children', () => {
    const { registry, rootContext } = Spark.createSystem()

    const wrapper = mount(SparkComponentRenderer as unknown as DefineComponent, {
      props: {
        config: { type: 'not-found' },
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
    expect(wrapper.text()).toContain('not-found')
  })
})
