import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { Spark, PAGE_COMPONENT_REGISTRY, useSparkComponent } from '@spark-view/spark-component'
import type { SparkNode } from '@spark-view/spark-component'
import { createPageComponentRegistry } from '../packages/spark-component/src/page/page-component-registry'

describe('SparkNode runtime contract', () => {
  function createTestPlugin() {
    const registry = Spark.createRegistry()
    return { plugin: Spark.createPlugin({ registry }), registry }
  }

  it('uses child runtime inputs for context id and instance registry instead of parent config injection', () => {
    const { plugin } = createTestPlugin()
    const componentRegistry = createPageComponentRegistry()

    const ChildComp = defineComponent({
      props: {
        id: String,
        visible: Boolean,
        disabled: Boolean,
        field: String,
      },
      setup() {
        const result = useSparkComponent({ type: 'test-child' } as SparkNode)
        const pageRegistry = result.sparkConsume(PAGE_COMPONENT_REGISTRY)

        expect(result.context.id).toBe('orders-table')
        expect(result.isVisible.value).toBe(false)
        expect(result.isDisabled.value).toBe(true)

        const instance = pageRegistry?.getInstance('orders-table')
        expect(instance?.id).toBe('orders-table')
        expect(instance?.type).toBe('test-child')
        expect(instance?.props?.['field']).toBe('orderNo')
        expect(instance?.props?.['visible']).toBe(false)
        expect(instance?.props?.['disabled']).toBe(true)

        return () => h('div', { class: 'sparknode-runtime-child' }, 'ok')
      },
    })

    const RootComp = defineComponent({
      setup() {
        const result = useSparkComponent({ type: 'root-comp' } as SparkNode)
        result.sparkProvide(PAGE_COMPONENT_REGISTRY, componentRegistry)
        return () => h(ChildComp, {
          id: 'orders-table',
          visible: false,
          disabled: true,
          field: 'orderNo',
        })
      },
    })

    const wrapper = mount(RootComp, {
      global: {
        plugins: [plugin],
      },
    })

    expect(wrapper.find('.sparknode-runtime-child').exists()).toBe(true)
  })
})