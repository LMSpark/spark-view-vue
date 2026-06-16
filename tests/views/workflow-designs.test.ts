import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkflowDesigns from '@/views/app/WorkflowDesigns.vue'
import type { WorkflowDesignDocument } from '@/services/workflow-designs'

const mocks = vi.hoisted(() => ({
  listWorkflowDesigns: vi.fn(),
  readWorkflowDesign: vi.fn(),
  saveWorkflowDesign: vi.fn(),
  createAgentWorkflowDefinitionFromDesign: vi.fn(),
  publishWorkflowDefinition: vi.fn(),
  createWorkflowDesign: vi.fn(),
  deleteWorkflowDesign: vi.fn(),
  message: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  messageBox: {
    confirm: vi.fn(),
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: mocks.message,
  ElMessageBox: mocks.messageBox,
}))

vi.mock('@/services/workflow-designs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/workflow-designs')>()
  return {
    ...actual,
    listWorkflowDesigns: mocks.listWorkflowDesigns,
    readWorkflowDesign: mocks.readWorkflowDesign,
    saveWorkflowDesign: mocks.saveWorkflowDesign,
    createAgentWorkflowDefinitionFromDesign: mocks.createAgentWorkflowDefinitionFromDesign,
    publishWorkflowDefinition: mocks.publishWorkflowDefinition,
    createWorkflowDesign: mocks.createWorkflowDesign,
    deleteWorkflowDesign: mocks.deleteWorkflowDesign,
  }
})

const ButtonStub = defineComponent({
  props: {
    disabled: Boolean,
  },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () => h('button', {
      ...attrs,
      disabled: props.disabled,
      type: 'button',
      onClick: () => emit('click'),
    }, slots['default']?.())
  },
})

const InputStub = defineComponent({
  props: {
    modelValue: {
      type: [String, Number],
      default: '',
    },
    type: String,
  },
  emits: ['update:modelValue', 'input'],
  setup(props, { attrs, emit }) {
    return () => {
      const tag = props.type === 'textarea' ? 'textarea' : 'input'
      return h(tag, {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) => {
          const target = event.target as HTMLInputElement | HTMLTextAreaElement
          emit('update:modelValue', target.value)
          emit('input', target.value)
        },
      })
    }
  },
})

const InputNumberStub = defineComponent({
  props: {
    modelValue: {
      type: Number,
      default: 0,
    },
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      type: 'number',
      value: props.modelValue,
      onInput: (event: Event) => {
        const target = event.target as HTMLInputElement
        const value = Number(target.value)
        emit('update:modelValue', value)
        emit('change', value)
      },
    })
  },
})

const PassthroughStub = defineComponent({
  setup(_props, { attrs, slots }) {
    return () => h('div', attrs, Object.values(slots).flatMap(slot => slot?.() ?? []))
  },
})

const DescriptionsItemStub = defineComponent({
  props: {
    label: String,
  },
  setup(props, { slots }) {
    return () => h('div', [
      h('span', props.label),
      h('span', slots['default']?.()),
    ])
  },
})

const HandleStub = defineComponent({
  props: {
    id: String,
    type: String,
    position: String,
  },
  setup(_props, { attrs, slots }) {
    return () => h('button', {
      ...attrs,
      type: 'button',
      class: ['vue-flow__handle', attrs['class']],
    }, slots['default']?.())
  },
})

const VueFlowStub = defineComponent({
  props: {
    nodes: {
      type: Array,
      default: () => [],
    },
    edges: {
      type: Array,
      default: () => [],
    },
  },
  emits: ['nodesChange', 'nodeDragStop', 'edgesChange', 'edgeUpdate', 'connect', 'viewportChangeEnd'],
  setup(props, { emit, slots }) {
    const nodeTitle = (node: any) => String(node.data?.title ?? node.id)
    const nodeByTitle = (title: string) => props.nodes.find((node: any) => nodeTitle(node) === title) as any

    return () => {
      const renderedNodes = props.nodes.map((node: any) => h('div', {
        class: 'vue-flow__node',
        'data-node-id': node.id,
        onClick: () => emit('nodesChange', [{ type: 'select', id: node.id, selected: true }]),
      }, [
        slots['node-workflow']?.({
          data: node.data,
          selected: false,
        }),
        h('button', {
          type: 'button',
          class: 'workflow-flow-drag-node',
          title: `移动 ${nodeTitle(node)}`,
          onClick: (event: Event) => {
            event.stopPropagation()
            emit('nodeDragStop', {
              node: {
                ...node,
                position: { x: 70, y: 30 },
              },
              nodes: props.nodes,
            })
          },
        }),
      ]))

      const renderedEdges = props.edges.map((edge: any) => h('button', {
        type: 'button',
        class: 'vue-flow__edge',
        title: `选择连线 ${edge.source} -> ${edge.target}`,
        onClick: () => emit('edgesChange', [{ type: 'select', id: edge.id, selected: true }]),
      }, `${edge.source}->${edge.target}`))

      const edgeUpdateButtons = props.edges.map((edge: any) => h('button', {
        type: 'button',
        class: 'workflow-flow-edge-update',
        title: `改连线 ${edge.source} -> ${edge.target} 到 end`,
        onClick: () => emit('edgeUpdate', {
          edge,
          connection: {
            source: edge.source,
            target: 'end',
            sourceHandle: 'source',
            targetHandle: 'target',
          },
        }),
      }))

      const exitNode = nodeByTitle('Exit Loop')
      const editNode = nodeByTitle('Edit identity')
      const connectButton = exitNode !== undefined && editNode !== undefined
        ? h('button', {
          type: 'button',
          class: 'workflow-flow-connect',
          title: '连接 Exit Loop -> Edit identity',
          onClick: () => emit('connect', {
            source: exitNode.id,
            target: editNode.id,
            sourceHandle: 'source',
            targetHandle: 'target',
          }),
        })
        : null

      return h('div', { class: 'vue-flow-stub' }, [
        ...renderedEdges,
        ...edgeUpdateButtons,
        ...renderedNodes,
        connectButton,
      ])
    }
  },
})

function createWorkflowDesignDocument(): WorkflowDesignDocument {
  return {
    kind: 'agent.workflow.design',
    version: 1,
    id: 'agent.workflow.demo',
    app: {
      id: 'agent.workflow.demo',
      name: 'Demo Workflow',
      mode: 'workflow',
    },
    workflow: {
      id: 'agent.workflow.demo',
      version: 1,
      graph: {
        nodes: [
          {
            id: 'start',
            type: 'custom',
            position: { x: 0, y: 160 },
            data: { type: 'start', title: 'Start' },
          },
          {
            id: 'loop.business-factory',
            type: 'custom',
            position: { x: 280, y: 40 },
            data: {
              type: 'loop',
              title: 'Loop',
              loop: {
                subGraph: {
                  nodes: [
                    {
                      id: 'phase.F0',
                      type: 'custom',
                      position: { x: 0, y: 0 },
                      data: {
                        type: 'tool',
                        title: 'Edit identity',
                        desc: 'Single model edit',
                        provider_id: 'spark.model-editor',
                        tool_name: 'single_model_edit',
                        model: {
                          phaseId: 'F0',
                          sectionPath: 'factory.identity',
                          value: { name: 'initial' },
                        },
                        x_spark: {
                          phaseId: 'F0',
                          sectionPath: 'factory.identity',
                          publishPath: 'workflow.factory.identity',
                        },
                      },
                    },
                    {
                      id: 'loop.inner',
                      type: 'custom',
                      position: { x: 260, y: 120 },
                      data: {
                        type: 'loop',
                        title: 'Nested Loop',
                        loop: {
                          subGraph: {
                            nodes: [
                              {
                                id: 'phase.F0.inner',
                                type: 'custom',
                                position: { x: 0, y: 0 },
                                data: {
                                  type: 'tool',
                                  title: 'Edit nested',
                                  provider_id: 'spark.model-editor',
                                  tool_name: 'single_model_edit',
                                  model: {
                                    phaseId: 'F0N',
                                    sectionPath: 'factory.identity.nested',
                                    value: { nested: true },
                                  },
                                  x_spark: {
                                    phaseId: 'F0N',
                                    sectionPath: 'factory.identity.nested',
                                    publishPath: 'workflow.factory.identity.nested',
                                  },
                                },
                              },
                            ],
                            edges: [],
                          },
                        },
                      },
                    },
                    {
                      id: 'loop.exit',
                      type: 'custom',
                      position: { x: 260, y: 480 },
                      data: { type: 'exit-loop', title: 'Exit Loop' },
                    },
                  ],
                  edges: [{ id: 'edge.F0.exit', source: 'phase.F0', target: 'loop.exit' }],
                },
              },
            },
          },
          {
            id: 'loop.review',
            type: 'custom',
            position: { x: 500, y: 80 },
            data: {
              type: 'loop',
              title: 'Review Loop',
              loop: {
                subGraph: {
                  nodes: [
                    {
                      id: 'phase.F1',
                      type: 'custom',
                      position: { x: 0, y: 0 },
                      data: {
                        type: 'tool',
                        title: 'Edit review',
                        provider_id: 'spark.model-editor',
                        tool_name: 'single_model_edit',
                        model: {
                          phaseId: 'F1',
                          sectionPath: 'factory.review',
                          value: { review: true },
                        },
                        x_spark: {
                          phaseId: 'F1',
                          sectionPath: 'factory.review',
                          publishPath: 'workflow.factory.review',
                        },
                      },
                    },
                  ],
                  edges: [],
                },
              },
            },
          },
          {
            id: 'end',
            type: 'custom',
            position: { x: 740, y: 160 },
            data: { type: 'end', title: 'End' },
          },
        ],
        edges: [
          { id: 'edge.start.loop', source: 'start', target: 'loop.business-factory' },
          { id: 'edge.loop.end', source: 'loop.business-factory', target: 'end' },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.design.v1',
      draft: { status: 'draft', dirtyPaths: [] },
      validation: { status: 'unknown', issues: [] },
    },
  }
}

function mountWorkflowDesigns() {
  return mount(WorkflowDesigns, {
    global: {
      mocks: {
        $router: { go: vi.fn() },
      },
      stubs: {
        ElAlert: PassthroughStub,
        ElButton: ButtonStub,
        ElCol: PassthroughStub,
        ElDescriptions: PassthroughStub,
        ElDescriptionsItem: DescriptionsItemStub,
        ElDialog: PassthroughStub,
        ElEmpty: true,
        ElForm: PassthroughStub,
        ElFormItem: PassthroughStub,
        ElIcon: PassthroughStub,
        ElInput: InputStub,
        ElInputNumber: InputNumberStub,
        ElPageHeader: PassthroughStub,
        ElRow: PassthroughStub,
        ElSkeleton: true,
        ElTag: PassthroughStub,
        Background: true,
        Controls: true,
        Handle: HandleStub,
        MiniMap: true,
        VueFlow: VueFlowStub,
      },
    },
  })
}

function findButton(wrapper: ReturnType<typeof mountWorkflowDesigns>, label: string) {
  const button = wrapper.findAll('button').find(item => item.text().includes(label))
  if (button === undefined) throw new Error(`missing button: ${label}`)
  return button
}

describe('WorkflowDesigns visual editor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mocks.messageBox.confirm.mockResolvedValue(undefined)
    mocks.listWorkflowDesigns.mockResolvedValue([
      {
        workflowId: 'agent.workflow.demo',
        filename: 'design.json',
        timestamp: '1',
        title: 'Demo Workflow',
        version: 1,
        status: 'draft',
      },
    ])
    mocks.readWorkflowDesign.mockResolvedValue({
      workflowId: 'agent.workflow.demo',
      filename: 'design.json',
      timestamp: '1',
      document: createWorkflowDesignDocument(),
    })
    mocks.saveWorkflowDesign.mockResolvedValue({
      ok: true,
      workflowId: 'agent.workflow.demo',
      filename: 'design.json',
      timestamp: '2',
    })
    mocks.createAgentWorkflowDefinitionFromDesign.mockReturnValue({
      kind: 'agent.workflow',
      version: 1,
      workflowId: 'agent.workflow.demo',
      x_spark: {
        validation: {
          status: 'valid',
          issues: [],
        },
      },
    })
    mocks.publishWorkflowDefinition.mockResolvedValue({
      ok: true,
      workflowId: 'agent.workflow.demo',
      filename: 'definition.json',
      timestamp: '3',
    })
  })

  it('lists, opens, edits, and saves a single_model_edit tool node', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    expect(mocks.listWorkflowDesigns).toHaveBeenCalledOnce()
    expect(mocks.readWorkflowDesign).toHaveBeenCalledWith('agent.workflow.demo')
    expect(wrapper.text()).toContain('single_model_edit')
    expect(wrapper.text()).toContain('phase.F0')

    const modelEditor = wrapper.find('textarea.model-json-input')
    expect(modelEditor.exists()).toBe(true)
    await modelEditor.setValue('{"name":"edited"}')

    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    expect(mocks.saveWorkflowDesign).toHaveBeenCalledOnce()
    const [workflowId, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(workflowId).toBe('agent.workflow.demo')
    expect(savedDocument.workflow.graph.nodes[1]?.data?.type).toBe('loop')
    expect(savedDocument.workflow.graph.nodes[1]?.data?.loop?.subGraph?.nodes[0]?.data?.model?.['value']).toEqual({
      name: 'edited',
    })
    expect(savedDocument.x_spark.draft?.['status']).toBe('saved')
  })

  it('drags a node and saves its new position', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const dragButton = wrapper.find('[title="移动 Edit identity"]')
    expect(dragButton.exists()).toBe(true)
    await dragButton.trigger('click')

    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.nodes[1]?.data?.loop?.subGraph?.nodes[0]?.position).toEqual({
      x: 70,
      y: 30,
    })
  })

  it('creates an edge from Vue Flow connect event and saves it', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const sourceHandle = wrapper.find('[title="从 Exit Loop 连线"]')
    const targetHandle = wrapper.find('[title="连到 Edit identity"]')
    expect(sourceHandle.exists()).toBe(true)
    expect(targetHandle.exists()).toBe(true)

    const connectButton = wrapper.find('[title="连接 Exit Loop -> Edit identity"]')
    expect(connectButton.exists()).toBe(true)
    await connectButton.trigger('click')

    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.nodes[1]?.data?.loop?.subGraph?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'loop.exit', target: 'phase.F0' }),
      ]),
    )
  })

  it('keeps connector handles available for Vue Flow drag connections', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const sourceHandle = wrapper.find('[title="从 Exit Loop 连线"]')
    const targetHandle = wrapper.find('[title="连到 Edit identity"]')
    expect(sourceHandle.exists()).toBe(true)
    expect(targetHandle.exists()).toBe(true)

    const connectButton = wrapper.find('[title="连接 Exit Loop -> Edit identity"]')
    expect(connectButton.exists()).toBe(true)
    await connectButton.trigger('click')

    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.nodes[1]?.data?.loop?.subGraph?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'loop.exit', target: 'phase.F0' }),
      ]),
    )
  })

  it('renders the two-level graph editor panes', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    expect(wrapper.findAll('.graph-split-pane')).toHaveLength(2)
    expect(wrapper.findAll('details.editor-section').length).toBeGreaterThanOrEqual(4)
    expect(wrapper.find('.graph-split-pane--main .section-label').text()).toContain('Main / Main Graph')
    expect(wrapper.find('.graph-split-pane--child .section-label').text()).toContain('Child / Loop Loop Subgraph')
  })

  it('switches the child graph from node selection and manual dropdown', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const childSelect = wrapper.find('select.graph-child-select')
    expect(childSelect.exists()).toBe(true)
    await childSelect.setValue('workflow.graph.loop.review.loop.subGraph')
    expect(wrapper.find('.graph-split-pane--child').text()).toContain('Edit review')

    const reviewLoopNode = wrapper.findAll('.workflow-node').find(node => node.text().includes('Review Loop'))
    if (reviewLoopNode === undefined) throw new Error('missing review loop node')
    await reviewLoopNode.trigger('click')
    await flushPromises()

    expect(wrapper.find('.graph-split-pane--child').text()).toContain('Review Loop Loop Subgraph')
    expect(wrapper.find('.graph-split-pane--child').text()).toContain('Edit review')
  })

  it('promotes the child graph to main and returns it to the parent', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, '提升为 main').trigger('click')
    await flushPromises()

    expect(wrapper.find('.graph-split-pane--main .section-label').text()).toContain('Main / Loop Loop Subgraph')
    expect(wrapper.find('.graph-split-pane--child .section-label').text()).toContain('Child / Nested Loop Loop Subgraph')

    await findButton(wrapper, '回父级').trigger('click')
    await flushPromises()

    expect(wrapper.find('.graph-split-pane--main .section-label').text()).toContain('Main / Main Graph')
    expect(wrapper.find('.graph-split-pane--child .section-label').text()).toContain('Child / Loop Loop Subgraph')
  })

  it('persists splitter ratio and collapsed state in localStorage only', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const splitter = wrapper.find('.graph-splitter')
    expect(splitter.exists()).toBe(true)

    dispatchPointerEvent('pointerdown', { clientX: 0, clientY: 360 }, splitter.element)
    dispatchPointerEvent('pointermove', { clientX: 0, clientY: 710 })
    dispatchPointerEvent('pointerup', { clientX: 0, clientY: 710 })
    await flushPromises()

    expect(wrapper.find('.graph-split').classes()).toContain('is-bottom-collapsed')
    expect(window.localStorage.getItem('spark.workflow-design.graph-split.agent.workflow.demo')).toContain('"collapsed":"bottom"')

    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(JSON.stringify(savedDocument)).not.toContain('graph-split')
  })

  it('creates a node in the selected graph section and saves it', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, '加工具').trigger('click')
    await findButton(wrapper, '创建节点').trigger('click')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'phase.F3',
          data: expect.objectContaining({
            type: 'tool',
            tool_name: 'single_model_edit',
          }),
        }),
      ]),
    )
  })

  it('deletes a node and removes related edges', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const endNode = wrapper.findAll('.workflow-node').find(node => node.text().includes('End'))
    if (endNode === undefined) throw new Error('missing end node')
    await endNode.trigger('click')
    await findButton(wrapper, '删除节点').trigger('click')
    await flushPromises()
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.nodes.map(node => node.id)).not.toContain('end')
    expect(savedDocument.workflow.graph.edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'end' }),
      ]),
    )
  })

  it('updates an edge endpoint from the edge editor and saves it', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const firstEdge = wrapper.find('.vue-flow__edge')
    expect(firstEdge.exists()).toBe(true)
    await firstEdge.trigger('click')

    const selects = wrapper.findAll('select.native-select')
      .filter(select => !select.classes().includes('graph-child-select'))
    expect(selects.length).toBeGreaterThanOrEqual(2)
    await selects[1]?.setValue('end')
    await findButton(wrapper, '应用连线').trigger('click')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.edges[0]).toEqual(expect.objectContaining({
      source: 'start',
      target: 'end',
    }))
  })

  it('resizes the main layout columns by dragging separators', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const leftHandle = wrapper.find('.layout-resize-handle')
    expect(leftHandle.exists()).toBe(true)

    dispatchPointerEvent('pointerdown', { clientX: 100, clientY: 10 }, leftHandle.element)
    dispatchPointerEvent('pointermove', { clientX: 160, clientY: 10 })
    dispatchPointerEvent('pointerup', { clientX: 160, clientY: 10 })
    await flushPromises()

    expect(wrapper.find('.workflow-design-shell').attributes('style')).toContain('340px')
  })

  it('rewires an edge target by dragging its endpoint to another node handle', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const firstEdge = wrapper.find('.vue-flow__edge')
    expect(firstEdge.exists()).toBe(true)
    await firstEdge.trigger('click')

    const edgeUpdateButton = wrapper.find('[title="改连线 start -> loop.business-factory 到 end"]')
    expect(edgeUpdateButton.exists()).toBe(true)
    await edgeUpdateButton.trigger('click')

    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.edges[0]).toEqual(expect.objectContaining({
      source: 'start',
      target: 'end',
    }))
  })

  it('publishes the current design as definition.json', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, '发布').trigger('click')
    await flushPromises()

    expect(mocks.createAgentWorkflowDefinitionFromDesign).toHaveBeenCalledOnce()
    expect(mocks.publishWorkflowDefinition).toHaveBeenCalledWith(
      'agent.workflow.demo',
      expect.objectContaining({
        kind: 'agent.workflow',
        workflowId: 'agent.workflow.demo',
      }),
    )
    expect(mocks.message.success).toHaveBeenCalledWith('definition.json 已发布')
  })
})

function dispatchPointerEvent(type: string, init: { clientX: number; clientY: number }, target: EventTarget = document): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
  })
  target.dispatchEvent(event)
}
