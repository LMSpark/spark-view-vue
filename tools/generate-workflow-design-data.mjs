#!/usr/bin/env node

import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const WORKFLOW_ROOT = path.resolve(
  import.meta.dirname,
  '..',
  'spark-ai-server',
  'data',
  'workflow-designs',
  'lmspark',
  'homepage',
)

const OLD_WORKFLOW_IDS = [
  'agent.workflow.20260615130850',
  'agent.workflow.20260615130928',
]

const PUBLISHED_AT = '2026-06-20T00:00:00.000Z'
const PROJECT_MODEL_PROJECTION_REF = {
  kind: 'dts-class-model',
  rootClassName: 'ProjectModel',
  manifestUrlRef: 'dts-class-model',
}
const PROJECT_MODEL_EXECUTABLE_REF = {
  kind: 'js-module',
  moduleSpecifier: '@spark-appworks/spark-project-model',
  exportName: 'ProjectModel',
}

const stringSchema = { type: 'string' }
const booleanSchema = { type: 'boolean' }

const allowedOperationsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    nodeTree: booleanSchema,
    dataSet: booleanSchema,
    script: booleanSchema,
    style: booleanSchema,
    navigation: booleanSchema,
  },
}

const pageDesignParamsSchema = {
  type: 'object',
  properties: {
    pageId: stringSchema,
    description: stringSchema,
    effectiveDescription: stringSchema,
    projectId: stringSchema,
    planningTitle: stringSchema,
    planningPath: stringSchema,
    mode: { type: 'string', enum: ['create', 'update', 'fix'] },
    allowedOperations: allowedOperationsSchema,
    preserveExistingInteractions: booleanSchema,
    strictImplGate: booleanSchema,
  },
  required: ['pageId', 'description', 'effectiveDescription'],
  additionalProperties: false,
}

const projectPlanningParamsSchema = {
  type: 'object',
  properties: {
    tenantId: stringSchema,
    projectScopeKey: stringSchema,
    projectId: stringSchema,
    requirement: stringSchema,
    planningAttachmentRef: stringSchema,
    navigationNodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nodeId: stringSchema,
          title: stringSchema,
          nodeKind: stringSchema,
          requirement: stringSchema,
          planningAttachmentRef: stringSchema,
        },
        required: ['nodeId', 'title', 'nodeKind', 'requirement'],
        additionalProperties: false,
      },
    },
  },
  required: ['projectScopeKey', 'projectId', 'requirement', 'navigationNodes'],
  additionalProperties: false,
}

async function main() {
  await mkdir(WORKFLOW_ROOT, { recursive: true })
  for (const workflowId of OLD_WORKFLOW_IDS) {
    await removeWorkflowDirectory(workflowId)
  }
  await writeWorkflow(createPageDesignWorkflowDesign())
  await writeWorkflow(createProjectPlanningWorkflowDesign())
}

async function removeWorkflowDirectory(workflowId) {
  const target = resolveWorkflowDirectory(workflowId)
  await rm(target, { recursive: true, force: true })
}

async function writeWorkflow(design) {
  const target = resolveWorkflowDirectory(design.id)
  await mkdir(target, { recursive: true })
  await writeJson(path.join(target, 'design.json'), design)
  await writeJson(path.join(target, 'definition.json'), createDefinitionFromDesign(design))
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function resolveWorkflowDirectory(workflowId) {
  const target = path.resolve(WORKFLOW_ROOT, workflowId)
  const rootWithSeparator = `${WORKFLOW_ROOT}${path.sep}`
  if (!target.startsWith(rootWithSeparator)) {
    throw new Error(`Refusing to write workflow outside root: ${target}`)
  }
  return target
}

function createDefinitionFromDesign(design) {
  return {
    kind: 'agent.workflow',
    version: 1,
    workflowId: design.workflow.id,
    source: {
      designKind: design.kind,
      designId: design.id,
      designVersion: design.version,
    },
    workflow: {
      variables: design.workflow.variables,
      capabilities: design.workflow.capabilities,
      graph: {
        nodes: design.workflow.graph.nodes,
        edges: design.workflow.graph.edges,
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.definition.v1',
      publishedAt: PUBLISHED_AT,
      validation: {
        status: 'valid',
        issues: [],
      },
    },
  }
}

function createPageDesignWorkflowDesign() {
  const workflowId = 'agent.workflow.pageDesign'
  return createWorkflowDesign({
    workflowId,
    title: 'Page Design',
    variables: [
      variable('pageId', 'Page ID', true, stringSchema),
      variable('description', 'Requirement', true, stringSchema),
      variable('effectiveDescription', 'Planning Description', true, stringSchema),
      variable('projectId', 'Project ID', false, stringSchema),
      variable('planningTitle', 'Planning Title', false, stringSchema),
      variable('planningPath', 'Planning Path', false, stringSchema),
      variable('mode', 'Run Mode', false, { type: 'string', enum: ['create', 'update', 'fix'] }),
      variable('allowedOperations', 'Allowed Operations', false, allowedOperationsSchema),
      variable('preserveExistingInteractions', 'Preserve Existing Interactions', false, booleanSchema),
      variable('strictImplGate', 'Strict Implementation Gate', false, booleanSchema),
    ],
    workflowCapability: {
      id: 'page-design.delivery',
      title: 'Page Design Delivery',
      description: 'Coordinate page design input, ClassModel runtime execution, and page file delivery.',
    },
    businessNode: {
      id: 'node.pageDesign',
      title: 'Page Design Module',
      inputs: {
        pageId: '{{ start.pageId }}',
        description: '{{ start.description }}',
        effectiveDescription: '{{ start.effectiveDescription }}',
      },
      outputs: {
        result: 'pageDesign.result',
      },
      llm: {
        task: {
          goal: 'Compose and deliver page design changes for the requested page.',
          requirements: {
            pageId: '{{ start.pageId }}',
            description: '{{ start.description }}',
            effectiveDescription: '{{ start.effectiveDescription }}',
          },
          contextInputs: {
            planningProjection: '{{ start.effectiveDescription }}',
          },
        },
        knowledge: {
          rootClassName: 'ProjectModel',
          className: 'ProjectModel',
          allowedActions: ['openPageDesign', 'editNodeTree', 'editDataSet'],
          readableAttributes: ['activePage'],
        },
        functionCalling: {
          mode: 'freeWithinModelContext',
          constraints: [
            'Runtime binding owns ClassModel knowledge lookup, script generation, and file delivery.',
          ],
        },
        output: {
          structuredResult: {
            result: 'pageDesign.result',
          },
          handoffToValidation: true,
        },
      },
      validation: {
        action: {
          className: 'ProjectModel',
          actionName: 'agent_complete',
          inputProjection: {
            summary: '{{ node.pageDesign.result }}',
          },
          expectedResult: {
            completed: true,
          },
        },
        status: 'draft',
        issues: [],
      },
      runtimeBinding: {
        registration: {
          alias: 'pageDesign',
          moduleId: 'pageDesign',
          businessId: 'pageDesign',
        },
        inputContract: {
          identityField: 'pageId',
          messageField: 'description',
          paramsSchema: pageDesignParamsSchema,
          readonlySteps: [
            '策划约束已注入 effectiveDescription（来自 readPlanningProjection）。',
            '业务契约见 ClassModel 知识索引（model_query / model_class_guide / model_action_guide）。',
          ],
        },
        systemPrompt: {
          template: 'pageDesign system prompt is interpolated by app binding.',
          conditionalHints: [
            {
              when: { allowedOperations: 'dataSetOnly' },
              template: 'pageDataDesign preset: only pagedata.json/DataSet changes are allowed.',
            },
          ],
        },
        modelProjectionRef: PROJECT_MODEL_PROJECTION_REF,
        executableRef: PROJECT_MODEL_EXECUTABLE_REF,
        toolLoopNudge: {
          templates: {
            plan_without_tool: 'pageId="{{moduleInstanceId}}"；禁止只输出计划，下一回合必须发起真实 tool_call。',
            execution_phase: 'pageId="{{moduleInstanceId}}"；目录/指南阶段已完成，直接 model_script。',
            model_script_retry: 'pageId="{{moduleInstanceId}}"；按 RECOVERY_HINT 修正后重试 model_script。',
          },
          contextFields: ['moduleInstanceId'],
        },
        beforeFunctionCall: {
          gateRules: [
            { kind: 'pageDesignMutationGate' },
            { kind: 'allowedOperations' },
            {
              kind: 'forbiddenScriptMarkers',
              markers: ['editNodeTree', 'editDataSet', 'setFileText', 'writePageFile'],
            },
          ],
        },
        executionToolNames: ['model_script'],
        planWithoutToolMarkers: ['openpagedesign', 'editnodetree', 'editdataset'],
        resolveInstance: {
          editorSource: 'pageDesign',
          identityField: 'pageId',
        },
      },
      capability: {
        id: 'page-design.compose',
        title: 'Compose Page Design',
        description: 'Let pageDesign inspect model knowledge and apply page design changes through runtime tools.',
        inputs: {
          pageId: '{{ start.pageId }}',
          description: '{{ start.description }}',
          effectiveDescription: '{{ start.effectiveDescription }}',
        },
        outputs: {
          result: 'pageDesign.result',
        },
      },
      outputResult: '{{ node.pageDesign.result }}',
    },
  })
}

function createProjectPlanningWorkflowDesign() {
  const workflowId = 'agent.workflow.projectPlanning'
  return createWorkflowDesign({
    workflowId,
    title: 'Project Planning',
    variables: [
      variable('projectScopeKey', 'Project Scope Key', true, stringSchema),
      variable('projectId', 'Project ID', true, stringSchema),
      variable('requirement', 'Project Requirement', true, stringSchema),
      variable('navigationNodes', 'Navigation Planning Nodes', true, projectPlanningParamsSchema.properties.navigationNodes),
      variable('tenantId', 'Tenant ID', false, stringSchema),
      variable('planningAttachmentRef', 'Planning Attachment Ref', false, stringSchema),
    ],
    workflowCapability: {
      id: 'project-planning.delivery',
      title: 'Project Planning Delivery',
      description: 'Coordinate project planning input, ClassModel runtime execution, and navigation plan delivery.',
    },
    businessNode: {
      id: 'node.projectPlanning',
      title: 'Project Planning Module',
      inputs: {
        projectScopeKey: '{{ start.projectScopeKey }}',
        projectId: '{{ start.projectId }}',
        requirement: '{{ start.requirement }}',
        navigationNodes: '{{ start.navigationNodes }}',
      },
      outputs: {
        result: 'projectPlanning.result',
      },
      llm: {
        task: {
          goal: 'Compose project planning navigation from requirement and navigation inputs.',
          requirements: {
            projectScopeKey: '{{ start.projectScopeKey }}',
            projectId: '{{ start.projectId }}',
            requirement: '{{ start.requirement }}',
            navigationNodes: '{{ start.navigationNodes }}',
          },
          contextInputs: {
            projectRequirement: '{{ start.requirement }}',
            navigationNodes: '{{ start.navigationNodes }}',
          },
        },
        knowledge: {
          rootClassName: 'ProjectModel',
          className: 'ProjectModel',
          allowedActions: [
            'readProjectPlanningInput',
            'readNavigationPlanningInputs',
            'replaceNavigationChildren',
            'completeProjectPlanning',
          ],
          readableAttributes: ['navigationRoot'],
        },
        functionCalling: {
          mode: 'freeWithinModelContext',
          constraints: [
            'Runtime binding owns ClassModel knowledge lookup, script generation, and navigation mutation.',
            'Completion must go through completeProjectPlanning via agent_complete.',
          ],
        },
        output: {
          structuredResult: {
            result: 'projectPlanning.result',
          },
          handoffToValidation: true,
        },
      },
      validation: {
        action: {
          className: 'ProjectModel',
          actionName: 'completeProjectPlanning',
          inputProjection: {
            summary: '{{ node.projectPlanning.result.summary }}',
          },
          expectedResult: {
            completed: true,
          },
        },
        status: 'draft',
        issues: [],
      },
      runtimeBinding: {
        registration: {
          alias: 'projectPlanning',
          moduleId: 'projectPlanning',
          businessId: 'projectPlanning',
        },
        inputContract: {
          identityField: 'projectScopeKey',
          messageField: 'requirement',
          paramsSchema: projectPlanningParamsSchema,
          readonlySteps: [
            '策划输入已注入 requirement 与 navigationNodes。',
            '业务契约见 DTS ClassModel 知识索引（model_query / model_action_guide）。',
          ],
        },
        systemPrompt: {
          template: 'projectPlanning system prompt is interpolated by app binding.',
          conditionalHints: [],
        },
        modelProjectionRef: PROJECT_MODEL_PROJECTION_REF,
        executableRef: PROJECT_MODEL_EXECUTABLE_REF,
        toolLoopNudge: {
          templates: {
            plan_without_tool: 'projectId="{{moduleInstanceId}}"；禁止只输出计划，下一回合必须发起 tool_call。',
            execution_phase: 'projectId="{{moduleInstanceId}}"；目录/指南阶段已完成，直接 model_script。',
            model_script_retry: 'projectId="{{moduleInstanceId}}"；按 RECOVERY_HINT 修正后重试 model_script。',
          },
          contextFields: ['moduleInstanceId'],
        },
        beforeFunctionCall: {
          gateRules: [
            { kind: 'projectPlanningToolGate' },
            { kind: 'projectActionLookup' },
            {
              kind: 'forbiddenScriptMarkers',
              markers: ['openPageDesign', 'writePageFile', 'setFileText', 'editNodeTree', 'editDataSet'],
            },
          ],
        },
        executionToolNames: ['model_script'],
        planWithoutToolMarkers: [
          'readplanningprojection',
          'readnavigationplanninginputs',
          'replacenavigationchildren',
          'readprojectplanninginput',
        ],
        agentCompleteMethodName: 'completeProjectPlanning',
        resolveInstance: {
          editorSource: 'projectPlanning',
          identityField: 'projectScopeKey',
        },
      },
      capability: {
        id: 'project-planning.compose',
        title: 'Compose Project Plan',
        description: 'Let projectPlanning inspect model knowledge and produce navigation planning changes through runtime tools.',
        inputs: {
          projectScopeKey: '{{ start.projectScopeKey }}',
          projectId: '{{ start.projectId }}',
          requirement: '{{ start.requirement }}',
          navigationNodes: '{{ start.navigationNodes }}',
        },
        outputs: {
          result: 'projectPlanning.result',
        },
      },
      outputResult: '{{ node.projectPlanning.result }}',
    },
  })
}

function createWorkflowDesign(command) {
  return {
    kind: 'agent.workflow.design',
    version: 1,
    id: command.workflowId,
    workflow: {
      id: command.workflowId,
      version: 1,
      variables: command.variables,
      capabilities: [
        {
          ...command.workflowCapability,
          scope: 'workflow',
          constraints: [
            'Workflow definition declares runtime binding; app layer injects executable capabilities.',
          ],
        },
      ],
      graph: {
        id: `${command.workflowId}.graph`,
        nodes: [
          {
            id: 'start',
            type: 'start',
            data: {
              type: 'start',
              title: 'Start',
            },
          },
          {
            id: command.businessNode.id,
            type: 'node',
            data: {
              type: 'node',
              title: command.businessNode.title,
              model: {
                rootClassName: 'ProjectModel',
                className: 'ProjectModel',
                contextPath: '$',
              },
              inputs: command.businessNode.inputs,
              outputs: command.businessNode.outputs,
              llm: command.businessNode.llm,
              validation: command.businessNode.validation,
              runtimeBinding: command.businessNode.runtimeBinding,
              state: {},
              result: {},
              capabilities: [
                {
                  ...command.businessNode.capability,
                  scope: 'node',
                  constraints: [
                    'Workflow definition names the module; runtime chooses ClassModel actions and script calls.',
                  ],
                },
              ],
            },
          },
          {
            id: 'output',
            type: 'output',
            data: {
              type: 'output',
              title: 'Output',
              outputs: {
                result: command.businessNode.outputResult,
              },
              capabilities: [],
            },
          },
        ],
        edges: [
          {
            id: 'edge.start.node',
            source: 'start',
            target: command.businessNode.id,
            data: {
              projection: {
                sourceRef: 'start.outputs',
                targetRef: `${command.businessNode.id}.inputs`,
              },
              branch: {
                label: 'default',
                default: true,
              },
              validation: {},
            },
          },
          {
            id: 'edge.node.output',
            source: command.businessNode.id,
            target: 'output',
            data: {
              projection: {
                sourceRef: `${command.businessNode.id}.outputs`,
                targetRef: 'output.inputs',
              },
              branch: {
                label: 'default',
                default: true,
              },
              validation: {},
            },
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.design.v1',
      designer: {
        title: command.title,
      },
      draft: {
        status: 'saved',
        dirtyPaths: [],
      },
      validation: {
        status: 'valid',
        issues: [],
      },
    },
  }
}

function variable(name, title, required, schema) {
  return { name, title, required, schema }
}

await main()
