import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { Spark, type SparkNode } from '@spark-view/spark-component'
import SparkComponentRenderer from '../components/SparkComponentRenderer.vue'

describe('SparkComponentRenderer', () => {
  it('moves SparkNode root runtime fields into props before rendering registered components', () => {
    const registry = Spark.createRegistry()
    registry.register('probe-host', defineComponent({
      name: 'ProbeHost',
      props: {
        type: String,
        id: String,
        label: String,
        field: String,
      },
      setup(props, { slots }) {
        return () => h('section', {
          'data-testid': 'host',
          'data-type': props.type,
          'data-id': props.id,
          'data-label': props.label,
          'data-field': props.field,
        }, slots['default']?.())
      },
    }))
    registry.register('probe-leaf', defineComponent({
      name: 'ProbeLeaf',
      props: {
        type: String,
        id: String,
        label: String,
        field: String,
      },
      setup(props) {
        return () => h('span', {
          'data-testid': 'leaf',
          'data-type': props.type,
          'data-id': props.id,
          'data-label': props.label,
          'data-field': props.field,
        })
      },
    }))

    const config = {
      type: 'probe-host',
      id: 'host-1',
      label: 'root-label',
      field: 'root-field',
      props: {
        field: 'props-field',
      },
      children: [
        {
          type: 'probe-leaf',
          id: 'leaf-1',
          label: 'leaf-root-label',
          props: {
            label: 'leaf-props-label',
            field: 'leaf-props-field',
          },
        },
      ],
    } as unknown as SparkNode & Record<string, unknown>

    const wrapper = mount(SparkComponentRenderer, {
      props: { config },
      global: {
        plugins: [Spark.createPlugin({ registry })],
        stubs: {
          SparkComponentRenderer: false,
          'spark-component-renderer': false,
        },
      },
    })

    const host = wrapper.find('[data-testid="host"]')
    expect(host.attributes('data-type')).toBe('probe-host')
    expect(host.attributes('data-id')).toBe('host-1')
    expect(host.attributes('data-label')).toBe('root-label')
    expect(host.attributes('data-field')).toBe('props-field')

    const leaf = wrapper.find('[data-testid="leaf"]')
    expect(leaf.attributes('data-type')).toBe('probe-leaf')
    expect(leaf.attributes('data-id')).toBe('leaf-1')
    expect(leaf.attributes('data-label')).toBe('leaf-props-label')
    expect(leaf.attributes('data-field')).toBe('leaf-props-field')
  })
})
