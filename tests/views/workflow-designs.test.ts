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
  parseAgentWorkflowDefinitionJson: vi.fn(),
  publishWorkflowDefinition: vi.fn(),
  readWorkflowDefinition: vi.fn(),
  saveWorkflowDefinition: vi.fn(),
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
    parseAgentWorkflowDefinitionJson: mocks.parseAgentWorkflowDefinitionJson,
    publishWorkflowDefinition: mocks.publishWorkflowDefinition,
    readWorkflowDefinition: mocks.readWorkflowDefinition,
    saveWorkflowDefinition: mocks.saveWorkflowDefinition,
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

    return () => {
      const renderedNodes = props.nodes.map((node: any) => h('div', {
        class: 'vue-flow__node',
        'data-node-id': node.id,
        onClick: () => emit('nodesChange', [{ type: 'select', id: node.id, selected: true }]),
      }, [
        slots['node-workflow']?.({
          data: node.data,
          selected: false,
          id: node.id,
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
        title: `改连线 ${edge.source} -> ${edge.target} 到 output`,
        onClick: () => emit('edgeUpdate', {
          edge,
          connection: {
            source: edge.source,
            target: 'output',
            sourceHandle: 'source',
            targetHandle: 'target',
          },
        }),
      }))

      return h('div', { class: 'vue-flow-stub' }, [
        ...renderedEdges,
        ...edgeUpdateButtons,
        ...renderedNodes,
      ])
    }
  },
})

function createWorkflowDesignDocument(workflowId = 'agent.workflow.demo'): WorkflowDesignDocument {
  return {
    kind: 'agent.workflow.design',
    version: 1,
    id: workflowId,
    workflow: {
      id: workflowId,
      version: 1,
      variables: [
        { name: 'prompt', title: 'Prompt', required: true },
      ],
      capabilities: [
        {
          id: 'demo.workflow',
          title: 'Demo Workflow',
          scope: 'workflow',
          description: 'Run the demo workflow.',
          constraints: [],
        },
      ],
      graph: {
        nodes: [
          {
            id: 'start',
            type: 'start',
            position: { x: 0, y: 160 },
            data: { type: 'start', title: 'Start' },
          },
          {
            id: 'node.model',
            type: 'node',
            position: { x: 280, y: 160 },
            data: {
              type: 'node',
              title: 'Business Node',
              desc: 'Run model context work',
              model: {
                rootClassName: 'ProjectModel',
                className: 'ProjectModel',
                contextPath: '$',
              },
              inputs: {
                prompt: 'initial',
              },
              outputs: {
                result: '$.result',
              },
              llm: {
                task: {
                  goal: 'Run page design work.',
                  requirements: {
                    prompt: 'initial',
                  },
                  contextInputs: {},
                },
                knowledge: {
                  rootClassName: 'ProjectModel',
                  className: 'ProjectModel',
                  allowedActions: ['openPageDesign', 'agent_complete'],
                  readableAttributes: ['activePage'],
                },
                functionCalling: {
                  mode: 'freeWithinModelContext',
                  constraints: [],
                },
                output: {
                  structuredResult: {
                    result: '$.result',
                  },
                  handoffToValidation: true,
                },
              },
              validation: {
                action: {
                  className: 'ProjectModel',
                  actionName: 'agent_complete',
                  inputProjection: {
                    summary: '$.result',
                  },
                  expectedResult: {
                    completed: true,
                  },
                },
                status: 'draft',
                issues: [],
              },
              capabilities: [
                {
                  id: 'page-design.execute',
                  title: 'Execute Page Design',
                  scope: 'node',
                  description: 'Let the pageDesign module plan and apply page design changes.',
                  inputs: {
                    prompt: 'initial',
                  },
                  outputs: {
                    result: '$.result',
                  },
                  constraints: [],
                },
              ],
            },
          },
          {
            id: 'output',
            type: 'output',
            position: { x: 560, y: 160 },
            data: {
              type: 'output',
              title: 'Output',
              outputs: {
                result: '{{ node.model.result }}',
              },
              capabilities: [],
            },
          },
        ],
        edges: [
          { id: 'edge.start.node', source: 'start', target: 'node.model' },
          { id: 'edge.node.output', source: 'node.model', target: 'output' },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.design.v1',
      designer: { title: 'Demo Workflow' },
      draft: { status: 'draft', dirtyPaths: [] },
      validation: { status: 'unknown', issues: [] },
    },
  }
}

function createDefinition() {
  return {
    kind: 'agent.workflow',
    version: 1,
    workflowId: 'agent.workflow.demo',
    workflow: {
      variables: [],
      capabilities: [],
      graph: {
        nodes: [],
        edges: [],
      },
    },
    x_spark: {
      validation: {
        status: 'valid',
        issues: [],
      },
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
    mocks.createAgentWorkflowDefinitionFromDesign.mockReturnValue(createDefinition())
    mocks.parseAgentWorkflowDefinitionJson.mockReturnValue(createDefinition())
    mocks.publishWorkflowDefinition.mockResolvedValue({
      ok: true,
      workflowId: 'agent.workflow.demo',
      filename: 'definition.json',
      timestamp: '3',
    })
    mocks.readWorkflowDefinition.mockResolvedValue({
      workflowId: 'agent.workflow.demo',
      filename: 'definition.json',
      timestamp: '3',
      definition: createDefinition(),
    })
    mocks.saveWorkflowDefinition.mockResolvedValue({
      ok: true,
      workflowId: 'agent.workflow.demo',
      filename: 'definition.json',
      timestamp: '4',
    })
  })

  it('auto-opens the first readable design and skips unreadable summaries', async () => {
    mocks.listWorkflowDesigns.mockResolvedValueOnce([
      {
        workflowId: 'agent.workflow.legacy',
        filename: 'design.json',
        timestamp: '1',
        title: 'Legacy Workflow',
        version: 1,
        status: 'unreadable',
        error: 'forbidden field: app',
      },
      {
        workflowId: 'agent.workflow.next',
        filename: 'design.json',
        timestamp: '2',
        title: 'Next Workflow',
        version: 1,
        status: 'draft',
      },
    ])
    mocks.readWorkflowDesign.mockResolvedValueOnce({
      workflowId: 'agent.workflow.next',
      filename: 'design.json',
      timestamp: '2',
      document: createWorkflowDesignDocument('agent.workflow.next'),
    })

    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    expect(mocks.readWorkflowDesign).toHaveBeenCalledOnce()
    expect(mocks.readWorkflowDesign).toHaveBeenCalledWith('agent.workflow.next')
    expect(wrapper.text()).toContain('agent.workflow.next')
    expect(mocks.message.warning).not.toHaveBeenCalled()
  })

  it('blocks opening an unreadable design without requesting design.json', async () => {
    mocks.listWorkflowDesigns.mockResolvedValueOnce([
      {
        workflowId: 'agent.workflow.legacy',
        filename: 'design.json',
        timestamp: '1',
        title: 'Legacy Workflow',
        version: 1,
        status: 'unreadable',
        error: 'forbidden field: app',
      },
      {
        workflowId: 'agent.workflow.demo',
        filename: 'design.json',
        timestamp: '2',
        title: 'Demo Workflow',
        version: 1,
        status: 'draft',
      },
    ])

    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const legacyItem = wrapper.findAll('.workflow-list-item')
      .find(item => item.text().includes('Legacy Workflow'))
    if (legacyItem === undefined) throw new Error('missing legacy workflow item')
    await legacyItem.trigger('click')
    await flushPromises()

    expect(mocks.readWorkflowDesign).toHaveBeenCalledOnce()
    expect(mocks.readWorkflowDesign).toHaveBeenCalledWith('agent.workflow.demo')
    expect(mocks.message.error).toHaveBeenCalledWith('设计稿不可打开: forbidden field: app')
  })

  it('keeps the empty state and warns when every design is unreadable', async () => {
    mocks.listWorkflowDesigns.mockResolvedValueOnce([
      {
        workflowId: 'agent.workflow.legacy',
        filename: 'design.json',
        timestamp: '1',
        title: 'Legacy Workflow',
        version: 1,
        status: 'unreadable',
        error: 'forbidden field: app',
      },
    ])

    mountWorkflowDesigns()
    await flushPromises()

    expect(mocks.readWorkflowDesign).not.toHaveBeenCalled()
    expect(mocks.message.warning).toHaveBeenCalledWith('当前设计稿均不可打开，请新建工作流或删除旧设计稿')
    expect(mocks.message.error).not.toHaveBeenCalled()
  })

  it('opens, edits, and saves a business node config', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    expect(mocks.listWorkflowDesigns).toHaveBeenCalledOnce()
    expect(mocks.readWorkflowDesign).toHaveBeenCalledWith('agent.workflow.demo')
    expect(wrapper.text()).toContain('Business Node')

    const modelEditor = wrapper.find('textarea.model-json-input')
    expect(modelEditor.exists()).toBe(true)
    expect((modelEditor.element as HTMLTextAreaElement).value).toContain('"className": "ProjectModel"')

    await modelEditor.setValue(JSON.stringify({
      type: 'node',
      title: 'Business Node',
      model: {
        rootClassName: 'ProjectModel',
        className: 'ProjectModel',
        contextPath: '$',
      },
      inputs: {
        prompt: 'edited',
      },
      outputs: {},
      llm: {
        task: {},
        knowledge: {},
        functionCalling: {
          mode: 'freeWithinModelContext',
        },
        output: {},
      },
      validation: {
        action: {
          className: 'ProjectModel',
          actionName: 'agent_complete',
          inputProjection: {},
          expectedResult: {},
        },
        issues: [],
      },
      capabilities: [],
    }))
    await findButton(wrapper, '应用节点配置').trigger('click')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    expect(mocks.saveWorkflowDesign).toHaveBeenCalledOnce()
    const [workflowId, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(workflowId).toBe('agent.workflow.demo')
    expect(savedDocument.workflow.graph.nodes[1]?.data?.inputs?.['prompt']).toBe('edited')
    expect(savedDocument.x_spark.draft?.['status']).toBe('saved')
  })

  it('drags a graph node and saves its new position', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const dragButton = wrapper.find('[title="移动 Business Node"]')
    expect(dragButton.exists()).toBe(true)
    await dragButton.trigger('click')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.nodes[1]?.position).toEqual({ x: 70, y: 30 })
  })

  it('creates a business node in the workflow graph', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, '加业务节点').trigger('click')
    await findButton(wrapper, '创建节点').trigger('click')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node.model-2',
          data: expect.objectContaining({
            type: 'node',
            model: expect.objectContaining({
              className: 'spark.placeholder.Model',
            }),
          }),
        }),
      ]),
    )
  })

  it('keeps start and output nodes protected while allowing business node deletion', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, '删除节点').trigger('click')
    await flushPromises()
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.nodes.map(node => node.id)).toEqual(['start', 'output'])
    expect(savedDocument.workflow.graph.edges).toHaveLength(0)
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
    await selects[1]?.setValue('output')
    await findButton(wrapper, '应用连线').trigger('click')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.edges[0]).toEqual(expect.objectContaining({
      source: 'start',
      target: 'output',
    }))
  })

  it('rewires an edge target from Vue Flow edge update', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const edgeUpdateButton = wrapper.find('[title="改连线 start -> node.model 到 output"]')
    expect(edgeUpdateButton.exists()).toBe(true)
    await edgeUpdateButton.trigger('click')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.edges[0]).toEqual(expect.objectContaining({
      source: 'start',
      target: 'output',
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

  it('marks ClassModel schema refs as legacy when creating a definition', async () => {
    const actual = await vi.importActual<typeof import('@/services/workflow-designs')>('@/services/workflow-designs')
    const document = createWorkflowDesignDocument()
    Object.assign(document.workflow as unknown as Record<string, unknown>, {
      features: {
        file_upload: { enabled: false },
      },
      environment_variables: [],
      conversation_variables: [],
    })
    const nodeData = document.workflow.graph.nodes[1]?.data
    if (nodeData === undefined) throw new Error('missing business node data')
    nodeData.x_spark = {
      classModel: {
        manifestPath: 'generated/dts-class-model/manifest.json',
        sourcePath: 'packages/spark-project-model/src/project/project-model.ts',
        rootClassName: 'ProjectModel',
        actionName: 'replaceNavigationChildren',
        schemaRefs: {
          params: {
            $ref: 'project-model.ts.json#/$defs/ProjectModel/$defs/method.replaceNavigationChildren.params',
          },
        },
      },
    }

    const definition = actual.createAgentWorkflowDefinitionFromDesign(document, {
      publishedAt: '2026-06-19T00:00:00.000Z',
    })

    expect(definition.workflow.graph.nodes[1]?.data).toMatchObject({
      type: 'node',
      model: {
        rootClassName: 'ProjectModel',
        className: 'ProjectModel',
        contextPath: '$',
      },
    })
    expect(definition.workflow.graph.nodes[1]?.data).not.toHaveProperty('x_spark')
    expect(definition.x_spark.validation).toMatchObject({
      status: 'invalid',
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'AGENT_WORKFLOW_LEGACY_CLASS_MODEL_META',
          nodeId: 'node.model',
        }),
      ]),
    })
    expect(definition.workflow as unknown as Record<string, unknown>).toMatchObject({
      features: {
        file_upload: { enabled: false },
      },
      environment_variables: [],
      conversation_variables: [],
    })
  })

  it('opens, edits, and saves definition.json', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, 'Definition').trigger('click')
    await flushPromises()

    expect(mocks.readWorkflowDefinition).toHaveBeenCalledWith('agent.workflow.demo', '')
    const definitionEditor = wrapper.find('textarea.definition-json-input')
    expect(definitionEditor.exists()).toBe(true)
    expect((definitionEditor.element as HTMLTextAreaElement).value).toContain('"kind": "agent.workflow"')

    await definitionEditor.setValue('{"kind":"agent.workflow"}')
    await findButton(wrapper, '保存 Definition').trigger('click')
    await flushPromises()

    expect(mocks.parseAgentWorkflowDefinitionJson).toHaveBeenCalledWith('{"kind":"agent.workflow"}')
    expect(mocks.saveWorkflowDefinition).toHaveBeenCalledWith(
      'agent.workflow.demo',
      expect.objectContaining({
        kind: 'agent.workflow',
        workflowId: 'agent.workflow.demo',
      }),
    )
    expect(mocks.message.success).toHaveBeenCalledWith('definition.json 已保存')
  })

  it('creates a local definition draft when the backend definition endpoint is missing', async () => {
    mocks.readWorkflowDefinition.mockRejectedValueOnce(new Error(
      'No static resource api/tenants/lmspark/projects/homepage/workflow-designs/agent.workflow.20260615095755/definition.json.',
    ))
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, 'Definition').trigger('click')
    await flushPromises()

    expect(mocks.createAgentWorkflowDefinitionFromDesign).toHaveBeenCalled()
    const definitionEditor = wrapper.find('textarea.definition-json-input')
    expect(definitionEditor.exists()).toBe(true)
    expect((definitionEditor.element as HTMLTextAreaElement).value).toContain('"kind": "agent.workflow"')
    expect(mocks.message.info).toHaveBeenCalledWith('definition.json 不存在，已从当前设计稿生成本地草稿')
    expect(mocks.message.error).not.toHaveBeenCalled()
  })
})
