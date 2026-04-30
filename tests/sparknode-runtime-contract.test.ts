import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { Spark, PAGE_COMPONENT_REGISTRY, registerAllRenderers, useSparkComponent } from '@spark-view/spark-component'
import type { SparkNode } from '@spark-view/spark-component'
import { createPageComponentRegistry } from '../packages/spark-component/src/page/context/page-component-registry'
import { buildPageChildren } from '../packages/spark-component/src/page/binding/build-page-children'

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
      setup(props) {
        // 节点定位 id 走顶层 id（硬切换语义：不再从 vnode.props.id 自动提升）。
        const result = useSparkComponent({ type: 'test-child', id: props.id } as SparkNode)
        const pageRegistry = result.sparkConsume(PAGE_COMPONENT_REGISTRY)

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

  it('keeps structural wrapper nodes in children during page binding', () => {
    const node: SparkNode = {
      type: 'r-tree',
      children: [
        {
          type: 'r-editor',
          children: [
            { type: 'r-form' },
          ],
        },
        { type: 'r-toolbar', children: [{ type: 'builtin-action' }] },
        { type: 'r-tree-node-summary' },
      ],
    }

    const [built] = buildPageChildren(
      [node as unknown as import('@spark-view/spark-page-config').RuleConfig],
      {
        callFunc: () => undefined,
        actionCtx: {} as Parameters<typeof buildPageChildren>[1]['actionCtx'],
      },
    )
    expect(built).toBeDefined()
    if (!built) throw new Error('buildPageChildren should return the bound node')

    expect(built.props?.['editor']).toBeUndefined()
    expect(built.props?.['toolbar']).toBeUndefined()
    expect(built.children).toHaveLength(3)
    expect((built.children?.[0] as SparkNode).children).toHaveLength(1)
    expect(((built.children?.[0] as SparkNode).children ?? [])[0]).toEqual(
      expect.objectContaining({ type: 'r-form' }),
    )
    expect((built.children?.[1] as SparkNode).children).toHaveLength(1)
    expect(((built.children?.[1] as SparkNode).children ?? [])[0]).toEqual(
      expect.objectContaining({ type: 'builtin-action' }),
    )
    expect(built.children?.[2]).toEqual(
      expect.objectContaining({ type: 'r-tree-node-summary' }),
    )
  })

  it('registers r-row-fragment as a public row-scoped primitive', () => {
    registerAllRenderers()

    expect(Spark.getRegistry().get('r-row-fragment')).toBeDefined()
  })
})