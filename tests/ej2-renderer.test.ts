import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RendererComponent from '../features/ej2/components/RendererComponent.vue'
import { createComponentRegistry, createComponentManager, SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from '@spark-view/spark-core'
import { h } from 'vue'

describe('EJ2 RendererComponent (registry-driven)', () => {
  it('renders registered component for type', () => {
    const registry = createComponentRegistry()
    const manager = createComponentManager(undefined, registry)
    // register a simple renderer component
    registry.register('registered-type', { type: 'registered-type', name: 'Reg', version: '1.0.0', component: { render() { return h('div', { class: 'registered-comp' }, 'ok') } } } as any)

    const wrapper = mount(RendererComponent as any, {
      props: { config: { type: 'registered-type', children: [] } },
      global: { provide: { [SPARK_MANAGER_KEY]: manager, [SPARK_REGISTRY_KEY]: registry } }
    })

    expect(wrapper.find('.registered-comp').exists()).toBe(true)
  })

  it('recurses into children when not registered', () => {
    const registry = createComponentRegistry()
    const manager = createComponentManager(undefined, registry)
    // register only child type
    registry.register('child-type', { type: 'child-type', name: 'Child', version: '1.0.0', component: { render() { return h('span', { class: 'child' }, 'c') } } } as any)

    const wrapper = mount(RendererComponent as any, {
      props: { config: { type: 'unknown', children: [{ type: 'child-type' }] } },
      global: { provide: { [SPARK_MANAGER_KEY]: manager, [SPARK_REGISTRY_KEY]: registry } }
    })

    expect(wrapper.find('.child').exists()).toBe(true)
  })

  it('shows error when not registered and no children', () => {
    const registry = createComponentRegistry()
    const manager = createComponentManager(undefined, registry)

    const wrapper = mount(RendererComponent as any, {
      props: { config: { type: 'not-found' } },
      global: { provide: { [SPARK_MANAGER_KEY]: manager, [SPARK_REGISTRY_KEY]: registry } }
    })

    expect(wrapper.find('.error-component').exists()).toBe(true)
    expect(wrapper.text()).toContain('not-found')
  })
})