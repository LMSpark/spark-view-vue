import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { DefineComponent } from 'vue'
import {
  Spark,
  SPARK_REGISTRY_KEY,
  SparkChildrenBridge,
  useSparkComponent,
} from '@spark-view/spark-component'

describe('SparkChildrenBridge', () => {
  it('bridges parentContext into template slot children', () => {
    const { registry, rootContext, createContext } = Spark.createSystem()
    const formContext = createContext({ type: 'r-form', id: 'form-bridge' }, rootContext)

    const SlotProbe = defineComponent({
      name: 'SlotProbe',
      setup() {
        const { parentType } = useSparkComponent({ type: 'slot-probe' })
        return () => h('div', {
          class: 'slot-probe',
          'data-parent-type': parentType ?? '',
        }, 'slot-probe')
      },
    })

    const wrapper = mount(SparkChildrenBridge as unknown as DefineComponent, {
      props: {
        parentContext: formContext,
      },
      slots: {
        default: () => h(SlotProbe),
      },
      global: {
        provide: {
          [SPARK_REGISTRY_KEY as symbol]: registry,
        },
      },
    })

    expect(wrapper.find('.slot-probe').attributes('data-parent-type')).toBe('r-form')
  })

  it('bridges parentContext into custom spark slot wrappers', () => {
    const { registry, rootContext, createContext } = Spark.createSystem()
    const formContext = createContext({ type: 'r-form', id: 'form-spark-slot' }, rootContext)

    const SparkSlotProbe = defineComponent({
      name: 'SparkSlotProbe',
      props: {
        childType: {
          type: String,
          required: true,
        },
        index: {
          type: Number,
          required: true,
        },
      },
      setup(props) {
        const { parentType } = useSparkComponent({ type: 'spark-slot-probe' })
        return () => h('div', {
          class: 'spark-child-wrapper',
          'data-index': String(props.index),
          'data-child-type': props.childType,
          'data-parent-type': parentType ?? '',
        }, 'spark-slot-probe')
      },
    })

    const wrapper = mount(SparkChildrenBridge as unknown as DefineComponent, {
      props: {
        sparkChildren: [{ type: 'test-leaf', id: 'leaf-1' }],
        parentContext: formContext,
      },
      slots: {
        spark: ({ child, index }: { child: { type: string }, index: number }) => h(SparkSlotProbe, {
          childType: child.type,
          index,
        }),
      },
      global: {
        provide: {
          [SPARK_REGISTRY_KEY as symbol]: registry,
        },
      },
    })

    expect(wrapper.find('.spark-child-wrapper').attributes('data-index')).toBe('0')
    expect(wrapper.find('.spark-child-wrapper').attributes('data-child-type')).toBe('test-leaf')
    expect(wrapper.find('.spark-child-wrapper').attributes('data-parent-type')).toBe('r-form')
  })
})