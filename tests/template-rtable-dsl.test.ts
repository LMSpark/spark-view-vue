import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { Component, PropType } from 'vue'
import {
  ElButton,
  RNumber,
  RTable,
  RText,
  SPARK_REGISTRY_KEY,
  Spark,
  SparkChild,
  createTemplateDsl,
} from '@spark-view/spark-component'
import type { SparkNode, SparkNodeChildren } from '@spark-view/spark-component'

// ── Shared test utilities ───────────────────────────────────────────────────

interface CapturedInput {
  type: string
  id: string | undefined
  children: SparkNodeChildren
  attrs: Record<string, unknown>
}

function createCapture() {
  let captured: CapturedInput = { type: '', id: undefined, children: [], attrs: {} }

  const component = defineComponent({
    name: 'TestCapture',
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
        // vitest-setup.ts 全局 stub 了 SparkComponentRenderer，
        // DSL 测试必须使用真实 Renderer 才能验证完整编译链路
        SparkComponentRenderer: false,
        'spark-component-renderer': false,
      },
    },
  })
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Template DSL — Production', () => {

  // ════════════════════════════════════════════════════════════════════════════
  // Section 1: createTemplateDsl factory
  // ════════════════════════════════════════════════════════════════════════════

  describe('createTemplateDsl factory', () => {
    it('creates a component that compiles to the given nodeType', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-form', capture.component)

      const RForm = createTemplateDsl('r-form', 'RForm')

      mountDsl(RForm, registry, { props: { dataKey: 'Users@currentRow' } })

      expect(capture.get().type).toBe('r-form')
      expect(capture.get().attrs['dataKey']).toBe('Users@currentRow')
    })

    it('factory-produced component is nestable as a template node', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      const RCustomPanel = createTemplateDsl('r-custom-panel', 'RCustomPanel')

      // Use inside RTable default slot — should compile to SparkNode child
      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows' },
        slots: {
          default: () => [h(RCustomPanel as Component, { title: 'test' })],
        },
      })

      const children = capture.get().children.filter(
        (c): c is SparkNode => typeof c === 'object' && c !== null,
      )
      expect(children).toHaveLength(1)
      expect(children[0]!.type).toBe('r-custom-panel')
      expect(children[0]!.props?.['title']).toBe('test')
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Section 2: Props passthrough (business props → SparkNode.props)
  // ════════════════════════════════════════════════════════════════════════════

  describe('props passthrough', () => {
    it('business props (dataKey, border, stripe) land in component attrs', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'Users@rows', border: true, stripe: true },
      })

      const r = capture.get()
      expect(r.attrs['dataKey']).toBe('Users@rows')
      expect(r.attrs['border']).toBe(true)
      expect(r.attrs['stripe']).toBe(true)
    })

    it('class and style pass through as business props', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows', class: 'custom-table', style: 'color: red' },
      })

      const r = capture.get()
      expect(r.attrs['class']).toBe('custom-table')
      expect(r.attrs['style']).toEqual({ color: 'red' })
    })

    it('disabled passes through to component', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows', disabled: true },
      })

      expect(capture.get().attrs['disabled']).toBe(true)
    })

    it('visible=false hides the node entirely', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      const wrapper = mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows', visible: false },
      })

      expect(wrapper.find('.capture').exists()).toBe(false)
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Section 3: Structural fields and ignored legacy inputs
  // ════════════════════════════════════════════════════════════════════════════

  describe('structural fields', () => {
    it('id attr → SparkNode.id → structural prop on component', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows', id: 'my-table' },
      })

      expect(capture.get().id).toBe('my-table')
      // id should NOT appear in business attrs
      expect(capture.get().attrs).not.toHaveProperty('id')
    })

    it('legacy order attr is ignored on child SparkNodes', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows' },
        slots: {
          default: () => [
            h(RText as Component, { field: 'b', order: 2 }),
            h(RText as Component, { field: 'a', order: 1 }),
          ],
        },
      })

      const children = capture.get().children.filter(
        (c): c is SparkNode => typeof c === 'object' && c !== null,
      )
      expect(children).toHaveLength(2)
      expect(children[0]!.props?.['field']).toBe('b')
      expect(children[0]!.props).not.toHaveProperty('order')
      expect(children[1]!.props?.['field']).toBe('a')
      expect(children[1]!.props).not.toHaveProperty('order')
    })

    it('named slot compiles to structured dock prop and ignores legacy dock attrs on inner nodes', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      // Child in toolbar slot with explicit dock="actions" in attrs
      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows' },
        slots: {
          toolbar: () => [
            h(ElButton as Component, { dock: 'actions', builtinAction: 'save' }),
          ],
        },
      })

      const toolbar = capture.get().attrs['toolbar'] as SparkNode | undefined
      expect(toolbar).toBeDefined()
      expect(toolbar?.type).toBe('r-toolbar')
      expect(toolbar?.children).toHaveLength(1)
      const inner = toolbar!.children![0] as SparkNode
      expect(inner.props).not.toHaveProperty('dock')
      expect(inner.props?.['builtinAction']).toBe('save')
    })

    it('id on child SparkNode is preserved', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows' },
        slots: {
          default: () => [
            h(RText as Component, { field: 'name', id: 'col-name' }),
          ],
        },
      })

      const children = capture.get().children.filter(
        (c): c is SparkNode => typeof c === 'object' && c !== null,
      )
      expect(children[0]!.id).toBe('col-name')
      // id should NOT be in business props
      expect(children[0]!.props).not.toHaveProperty('id')
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Section 4: Type dual semantics (fixedNodeType)
  // ════════════════════════════════════════════════════════════════════════════

  describe('type dual semantics', () => {
    it('fixed nodeType component: raw type attr preserved as business prop', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      // RText has fixedNodeType='r-text', so <RText type="password" />
      // should compile to { type: 'r-text', props: { type: 'password' } }
      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows' },
        slots: {
          default: () => [
            h(RText as Component, { field: 'pwd', type: 'password' }),
          ],
        },
      })

      const children = capture.get().children.filter(
        (c): c is SparkNode => typeof c === 'object' && c !== null,
      )
      expect(children[0]!.type).toBe('r-text')
      expect(children[0]!.props?.['type']).toBe('password')
      expect(children[0]!.props?.['field']).toBe('pwd')
    })

    it('SparkChild without fixedNodeType: type consumed as structural, not business', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows' },
        slots: {
          default: () => [
            h(SparkChild as Component, { type: 'el-input', placeholder: 'search' }),
          ],
        },
      })

      const children = capture.get().children.filter(
        (c): c is SparkNode => typeof c === 'object' && c !== null,
      )
      expect(children[0]!.type).toBe('el-input')
      // 'type' should NOT be in business props for non-fixed components
      expect(children[0]!.props).not.toHaveProperty('type')
      expect(children[0]!.props?.['placeholder']).toBe('search')
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Section 5: Event handling
  // ════════════════════════════════════════════════════════════════════════════

  describe('event handling', () => {
    it('onXxx listener props pass through to component', () => {
      const handler = vi.fn()
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows', onRowClick: handler },
      })

      // Vue onXxx props pass straight through (not in FILTERED_PROP_KEYS)
      expect(capture.get().attrs['onRowClick']).toBe(handler)
    })

    it('on:{} event map is converted to onXxx listener props by Renderer', () => {
      const handler = vi.fn()
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows', on: { 'row-click': handler } },
      })

      // Renderer extracts on:{} from props, converts via toListenerPropName
      expect(capture.get().attrs['onRowClick']).toBe(handler)
      // Original 'on' should be filtered out
      expect(capture.get().attrs).not.toHaveProperty('on')
    })

    it('onXxx events on child nodes are compiled into SparkNode.props', () => {
      const handler = vi.fn()
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows' },
        slots: {
          default: () => [
            h(RText as Component, { field: 'name', onClick: handler }),
          ],
        },
      })

      const children = capture.get().children.filter(
        (c): c is SparkNode => typeof c === 'object' && c !== null,
      )
      expect(children[0]!.props?.['onClick']).toBe(handler)
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Section 6: Named slots → dock mapping
  // ════════════════════════════════════════════════════════════════════════════

  describe('named slots → dock mapping', () => {
    it('compiles toolbar/default/actions slots into dock props + content children', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'Orders@rows' },
        slots: {
          toolbar: () => [
            h(ElButton as Component, { builtinAction: 'append-row' }),
          ],
          default: () => [
            h(RText as Component, { field: 'name' }),
            h(RNumber as Component, { field: 'age' }),
          ],
          actions: () => [
            h(ElButton as Component, { builtinAction: 'delete-row' }),
          ],
        },
      })

      const all = capture.get().children.filter(
        (c): c is SparkNode => typeof c === 'object' && c !== null,
      )
      const toolbar = capture.get().attrs['toolbar'] as SparkNode | undefined
      const actions = capture.get().attrs['actions'] as SparkNode | undefined

      // Named slots produce structured dock props; default slot produces direct children
      const content = all

      expect(toolbar?.type).toBe('r-toolbar')
      expect((toolbar!.children![0] as SparkNode).type).toBe('builtin-action')

      expect(content).toHaveLength(2)
      expect(content.map(c => c.type)).toEqual(['r-text', 'r-number'])

      expect(actions?.type).toBe('r-actions')
      expect((actions!.children![0] as SparkNode).type).toBe('builtin-action')
    })

    it('custom named slot maps to structured dock prop with r- prefix', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows' },
        slots: {
          footer: () => [
            h(RText as Component, { field: 'summary' }),
          ],
        },
      })

      const children = capture.get().children.filter(
        (c): c is SparkNode => typeof c === 'object' && c !== null,
      )
      const footer = capture.get().attrs['footer'] as SparkNode | undefined

      expect(children).toHaveLength(0)
      expect(footer?.type).toBe('r-footer')
      expect((footer!.children![0] as SparkNode).props?.['field']).toBe('summary')
    })

    it('empty slot produces no children', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows' },
        slots: {
          toolbar: () => [],
        },
      })

      expect(capture.get().children).toHaveLength(0)
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Section 7: Nested children compilation
  // ════════════════════════════════════════════════════════════════════════════

  describe('nested children', () => {
    it('SparkChild children inside RTable are compiled as SparkNode tree', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows' },
        slots: {
          default: () => [
            h(SparkChild as Component, {
              type: 'el-table-column',
              label: '操作',
            }, {
              default: () => [
                h(ElButton as Component, { builtinAction: 'edit' }),
              ],
            }),
          ],
        },
      })

      const children = capture.get().children.filter(
        (c): c is SparkNode => typeof c === 'object' && c !== null,
      )
      expect(children).toHaveLength(1)
      expect(children[0]!.type).toBe('el-table-column')
      expect(children[0]!.props?.['label']).toBe('操作')

      const grandChildren = (children[0]!.children ?? []).filter(
        (c): c is SparkNode => typeof c === 'object' && c !== null,
      )
      expect(grandChildren).toHaveLength(1)
      expect(grandChildren[0]!.type).toBe('builtin-action')
      expect(grandChildren[0]!.props?.['builtinAction']).toBe('edit')
    })

    it('text children are preserved as string in SparkNode.children', () => {
      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: { dataKey: 'X@rows' },
        slots: {
          default: () => [
            h(SparkChild as Component, { type: 'span' }, {
              default: () => ['Hello World'],
            }),
          ],
        },
      })

      const children = capture.get().children.filter(
        (c): c is SparkNode => typeof c === 'object' && c !== null,
      )
      expect(children[0]!.children).toEqual(['Hello World'])
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Section 8: Config-式 parity proof
  // ════════════════════════════════════════════════════════════════════════════

  describe('config parity proof', () => {
    it('DSL produces equivalent SparkNode to config JSON', () => {
      // New model: named slots produce structured dock props
      // {
      //   "type": "r-table",
      //   "id": "orders-grid",
      //   "props": {
      //     "dataKey": "Orders@rows",
      //     "border": true,
      //     "highlightCurrentRow": true,
      //     "toolbar": { "type": "r-toolbar", "children": [{ "type": "r-text", "props": { "field": "search" } }] },
      //     "actions": { "type": "r-actions", "children": [{ "type": "builtin-action", "props": { "builtinAction": "delete-row" } }] }
      //   },
      //   "children": [
      //     { "type": "r-number", "props": { "field": "amount" } },
      //   ]
      // }

      const { registry } = Spark.createSystem()
      const capture = createCapture()
      registry.register('r-table', capture.component)

      mountDsl(RTable, registry, {
        props: {
          id: 'orders-grid',
          dataKey: 'Orders@rows',
          border: true,
          highlightCurrentRow: true,
        },
        slots: {
          toolbar: () => [
            h(RText as Component, { field: 'search' }),
          ],
          default: () => [
            h(RNumber as Component, { field: 'amount' }),
          ],
          actions: () => [
            h(ElButton as Component, { builtinAction: 'delete-row' }),
          ],
        },
      })

      const r = capture.get()

      // Container structural fields
      expect(r.type).toBe('r-table')
      expect(r.id).toBe('orders-grid')

      // Container business props
      expect(r.attrs['dataKey']).toBe('Orders@rows')
      expect(r.attrs['border']).toBe(true)
      expect(r.attrs['highlightCurrentRow']).toBe(true)
      const toolbar = r.attrs['toolbar'] as SparkNode | undefined
      const actions = r.attrs['actions'] as SparkNode | undefined

      expect(toolbar?.type).toBe('r-toolbar')
      expect(actions?.type).toBe('r-actions')

      // Children structure
      const all = r.children.filter(
        (c): c is SparkNode => typeof c === 'object' && c !== null,
      )
      expect(all).toHaveLength(1)

      // Toolbar dock prop
      const toolbarInner = toolbar!.children![0] as SparkNode
      expect(toolbarInner.type).toBe('r-text')
      expect(toolbarInner.props?.['field']).toBe('search')

      // Default child (direct)
      expect(all[0]!.type).toBe('r-number')
      expect(all[0]!.props?.['field']).toBe('amount')

      // Actions dock prop
      const actionsInner = actions!.children![0] as SparkNode
      expect(actionsInner.type).toBe('builtin-action')
      expect(actionsInner.props?.['builtinAction']).toBe('delete-row')
    })
  })
})


