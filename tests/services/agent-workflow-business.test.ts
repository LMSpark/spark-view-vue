import { describe, expect, it } from 'vitest'
import {
  createAiAgentHost,
  type AiAgentHost,
  type AiAgentTurnCallbacks,
} from '@spark-appworks/spark-ai/agent'
import type { ClassModelKnowledgeProvider } from '@spark-appworks/spark-ai/class-model'
import {
  createPageDesignAgentWorkflowDefinition,
  ensurePageDesignBusiness,
  PAGE_DESIGN_AGENT_WORKFLOW_PROCESS,
  PAGE_DESIGN_MODULE_ID,
} from '@/services/page-design/page-design-business'
import {
  createProjectPlanningAgentWorkflowDefinition,
  ensureProjectPlanningBusiness,
  PROJECT_PLANNING_AGENT_WORKFLOW_PROCESS,
  PROJECT_PLANNING_MODULE_ID,
} from '@/services/project-planning/project-planning-business'

describe('app agent workflow business activation', () => {
  it('activates pageDesign through AgentWorkflowDefinition and supports host dryRun', () => {
    const host = ensurePageDesignBusiness({
      host: createHost(),
      getPageDesignEditor: () => {
        throw new Error('dryRun must not resolve pageDesign editor')
      },
      knowledge: createKnowledgeProvider(),
    })

    const definition = createPageDesignAgentWorkflowDefinition()
    const result = host.dryRun(PAGE_DESIGN_MODULE_ID, {
      pageId: 'orders',
      description: 'Build orders page',
      effectiveDescription: 'Orders list with filters',
      projectId: 'demo',
    })

    expect(definition.factory.activation.value).toEqual({
      registrationBindingKey: 'pageDesign.registration',
      handoff: {
        target: 'runtime-binding',
        workflowDoesNotActivateHost: true,
        bindingRef: 'pageDesign.registration',
      },
    })
    expect(definition.process).toEqual(PAGE_DESIGN_AGENT_WORKFLOW_PROCESS)
    expect(definition.factory.workOrder.value).toMatchObject({
      productionProcess: {
        processId: 'pageDesign.data-first-100-step-process',
        mode: 'progressive-data-first-craft',
      },
    })
    expect(host.has(PAGE_DESIGN_MODULE_ID)).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('activates projectPlanning through AgentWorkflowDefinition and supports host dryRun', () => {
    const host = ensureProjectPlanningBusiness({
      host: createHost(),
      getProjectPlanningEditor: () => {
        throw new Error('dryRun must not resolve projectPlanning editor')
      },
      knowledge: createKnowledgeProvider(),
    })

    const definition = createProjectPlanningAgentWorkflowDefinition()
    const result = host.dryRun(PROJECT_PLANNING_MODULE_ID, {
      projectScopeKey: 'demo',
      projectId: 'demo',
      requirement: 'Plan order management',
      navigationNodes: [],
    })

    expect(definition.factory.activation.value).toEqual({
      registrationBindingKey: 'projectPlanning.registration',
      handoff: {
        target: 'runtime-binding',
        workflowDoesNotActivateHost: true,
        bindingRef: 'projectPlanning.registration',
      },
    })
    expect(definition.process).toEqual(PROJECT_PLANNING_AGENT_WORKFLOW_PROCESS)
    expect(definition.process?.stages.map(stage => stage.stageId)).toEqual([
      'PP1.intake-inventory',
      'PP2.domain-decomposition',
      'PP3.page-tree-planning',
      'PP4.node-contract',
      'PP5.model-write',
      'PP6.verify-deliver',
    ])
    expect(definition.process?.knowledgeSources?.map(ref => ref.refId)).toEqual(expect.arrayContaining([
      'doc.platformRouting.projectPlanning',
      'generated.projectModel',
      'generated.projectNode',
    ]))
    expect(definition.factory.workOrder.value).toMatchObject({
      productionProcess: {
        processId: 'projectPlanning.navigation-craft-process',
        mode: 'progressive-navigation-craft',
      },
    })
    expect(host.has(PROJECT_PLANNING_MODULE_ID)).toBe(true)
    expect(result.ok).toBe(true)
  })
})

function createHost(): AiAgentHost {
  const turnCallbacks: AiAgentTurnCallbacks = {
    executeTurn: async () => ({ text: '', toolCalls: [] }),
    appendMessages: async () => undefined,
  }
  return createAiAgentHost({ turnCallbacks })
}

function createKnowledgeProvider(): ClassModelKnowledgeProvider {
  return {
    query: () => ({}),
    modelGuide: () => 'ProjectModel guide',
    attributeGuide: () => 'ProjectModel attribute guide',
    methodGuide: () => 'ProjectModel method guide',
  }
}
