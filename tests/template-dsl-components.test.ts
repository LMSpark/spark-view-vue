import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { Component, PropType } from 'vue'
import {
  ElButton,
  RDialog,
  RForm,
  RText,
  RTabs,
  RToolbar,
  SPARK_REGISTRY_KEY,
  Spark,
  SparkChild,
} from '@spark-view/spark-component'
import type { SparkNode, SparkNodeChildren } from '@spark-view/spark-component'

interface CapturedInput {
  type: string
  id: string | undefined
  children: SparkNodeChildren
  attrs: Record<string, unknown>
}

function createCapture() {
  let captured: CapturedInput = { type: '', id: undefined, children: [], attrs: {} }

  const component = defineComponent({
    name: 'TemplateDslCapture',
    props: {
      type: { type: String, default: '' },
      id: { type: String, default: undefined },
      children: { type: Array as PropType<SparkNodeChildren>, default: () => [] },
    },
    inheritAttrs: false,
    setup(props, { attrs }) {
      captured = {
        type: props.type,
        id: props.id,
        children: [...(props.children ?? [])],
        attrs: { ...attrs },
      }
      return () => h('div', { class: 'capture' })
    },
  })

  return { component, get: () => captured }
}

function mountDsl(
  dslComponent: unknown,
  registry: ReturnType<typeof Spark.createSystem>['registry'],
  options: { props?: Record<string, unknown>; slots?: Record<string, () => unknown[]> } = {},
) {
  return mount(dslComponent as Component, {
    ...options,
    global: {
      provide: { [SPARK_REGISTRY_KEY as symbol]: registry },
      stubs: {
        SparkComponentRenderer: false,
        'spark-component-renderer': false,
      },
    },
  })
}

function objectChildren(children: SparkNodeChildren): SparkNode[] {
  return children.filter((child): child is SparkNode => typeof child === 'object' && child !== null)
}

describe('Template DSL container coverage', () => {
  it('RForm compiles toolbar slot into structured toolbar dock prop and keeps field children', () => {
    const { registry } = Spark.createSystem()
    const capture = createCapture()
    registry.register('r-form', capture.component)

    mountDsl(RForm, registry, {
      props: { dataKey: 'Users@currentRow', labelWidth: '88px' },
      slots: {
        toolbar: () => [h(ElButton as Component, { builtinAction: 'refresh' })],
        default: () => [h(RText as Component, { field: 'name', label: '姓名' })],
      },
    })

    const toolbar = capture.get().attrs['toolbar'] as SparkNode | undefined
    const fields = objectChildren(capture.get().children)

    expect(toolbar).toBeDefined()
    expect((toolbar!.children![0] as SparkNode).type).toBe('builtin-action')
    expect(fields).toHaveLength(1)
    expect(fields[0]!.type).toBe('r-text')
    expect(fields[0]!.props?.['field']).toBe('name')
  })

  it('RToolbar compiles tail slot into structured tail dock prop', () => {
    const { registry } = Spark.createSystem()
    const capture = createCapture()
    registry.register('r-toolbar', capture.component)

    mountDsl(RToolbar, registry, {
      props: { gap: 12, zoneGap: 24 },
      slots: {
        default: () => [h(ElButton as Component, { builtinAction: 'refresh' })],
        tail: () => [h(ElButton as Component, { builtinAction: 'append-row' })],
      },
    })

    const children = objectChildren(capture.get().children)
    const tail = capture.get().attrs['tail'] as SparkNode | undefined

    expect(children.map(child => child.type)).toEqual(['builtin-action'])
    expect(tail?.children).toHaveLength(1)
    expect((tail!.children![0] as SparkNode).type).toBe('builtin-action')
  })

  it('RTabs keeps pane nodes in children and toolbar in structured dock prop', () => {
    const { registry } = Spark.createSystem()
    const capture = createCapture()
    registry.register('r-tabs', capture.component)

    mountDsl(RTabs, registry, {
      props: { modelValue: 'base' },
      slots: {
        toolbar: () => [h(ElButton as Component, { builtinAction: 'refresh' })],
        default: () => [
          h(SparkChild as Component, { type: 'r-tab-pane', label: '基本信息', name: 'base' }, {
            default: () => [h(RText as Component, { field: 'name', label: '姓名' })],
          }),
        ],
      },
    })

    const children = objectChildren(capture.get().children)
    const toolbar = capture.get().attrs['toolbar'] as SparkNode | undefined

    expect(toolbar?.type).toBe('r-toolbar')
    expect(children.map(child => child.type)).toEqual(['r-tab-pane'])
    const pane = children[0]
    expect(pane?.props?.['label']).toBe('基本信息')
    expect((pane!.children![0] as SparkNode).type).toBe('r-text')
  })

  it('RDialog footer slot maps to structured footer dock prop', () => {
    const { registry } = Spark.createSystem()
    const capture = createCapture()
    registry.register('r-dialog', capture.component)

    mountDsl(RDialog, registry, {
      props: { title: '编辑成员', modelValue: true },
      slots: {
        footer: () => [h(ElButton as Component, { builtinAction: 'save' })],
      },
    })

    const children = objectChildren(capture.get().children)
    const footer = capture.get().attrs['footer'] as SparkNode | undefined

    expect(children).toHaveLength(0)
    expect(footer?.type).toBe('r-footer')
    expect((footer!.children![0] as SparkNode).type).toBe('builtin-action')
  })
})