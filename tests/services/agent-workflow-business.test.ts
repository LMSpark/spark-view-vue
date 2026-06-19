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
  PAGE_DESIGN_MODULE_ID,
} from '@/services/page-design/page-design-business'
import {
  createProjectPlanningAgentWorkflowDefinition,
  ensureProjectPlanningBusiness,
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

    expect(definition.workflow.graph.nodes.map(node => node.type)).toEqual(['start', 'tool', 'end'])
    expect(definition.workflow.graph.nodes.find(node => node.id === 'tool.pageDesign')).toMatchObject({
      type: 'tool',
      data: {
        provider: 'class-model',
        toolName: 'model_script',
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

    expect(definition.workflow.graph.nodes.map(node => node.type)).toEqual(['start', 'tool', 'end'])
    expect(definition.workflow.graph.nodes.find(node => node.id === 'tool.projectPlanning')).toMatchObject({
      type: 'tool',
      data: {
        provider: 'class-model',
        toolName: 'model_script',
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
