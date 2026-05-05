import { beforeEach, describe, expect, it } from 'vitest'

import { clearRegistry, executeStill } from '../packages/spark-ai/src/core/stills/dispatcher'
import { clearDomains, createBareSession } from '../packages/spark-ai/src/core/stills/domain'
import { registerPageDesignEditStills } from '../packages/spark-ai/src/business/page-design/register-edit-stills'
import {
  TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES,
  TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES,
} from '../packages/spark-data/src'
import { getStill } from '../packages/spark-ai/src/core/stills/dispatcher'
import { functionNameToAction, generateToolDefinitions, stillToToolDefinition } from '../packages/spark-ai/src/core/fc-schema'
import type {
  KnowledgeModuleSummary,
  KnowledgeToolGuide,
  KnowledgeToolSummary,
} from '../packages/spark-ai/src/core/knowledge/types'

interface QueryToolsResult {
  modules: KnowledgeModuleSummary[]
  tools: KnowledgeToolSummary[]
  total: number
  hint: string
}

beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerPageDesignEditStills()
})

describe('tool-calling schema generation', () => {
  it('keeps nested object schema for pageDesign@nodeTree@addNode', () => {
    const still = getStill('pageDesign@nodeTree@addNode')
    expect(still).toBeDefined()
    if (still === undefined) return

    const definition = stillToToolDefinition(still)
    const parameters = definition.function.parameters

    expect(parameters.required ?? []).toContain('node')

    const nodeProp = parameters.properties['node']
    expect(nodeProp?.type).toBe('object')
    expect(nodeProp?.required ?? []).toContain('type')
    expect(nodeProp?.properties?.['type']?.type).toBe('string')
  })

  it('keeps parentComponentId optional for pageDesign@nodeTree@listChildren', () => {
    const still = getStill('pageDesign@nodeTree@listChildren')
    expect(still).toBeDefined()
    if (still === undefined) return

    const definition = stillToToolDefinition(still)
    const parameters = definition.function.parameters

    expect(parameters.required ?? []).not.toContain('parentComponentId')
    expect(parameters.properties['parentComponentId']?.type).toBe('string')
  })

  it('surfaces open-ended enum hints for pageDesign@dataset@updateTable semantic fields', () => {
    const still = getStill('pageDesign@dataset@updateTable')
    expect(still).toBeDefined()
    if (still === undefined) return

    const definition = stillToToolDefinition(still)
    const parameters = definition.function.parameters
    const resourceType = parameters.properties['resourceType']
    const businessCategory = parameters.properties['businessCategory']

    expect(parameters.required ?? []).not.toContain('resourceType')
    expect(parameters.required ?? []).not.toContain('businessCategory')

    expect(resourceType?.type).toEqual(['string', 'null'])
    expect(resourceType?.description).toContain('推荐值')
    expect(resourceType?.description).toContain('也允许自定义值')
    for (const value of TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES) {
      expect(resourceType?.description).toContain(value)
    }

    expect(businessCategory?.type).toEqual(['string', 'null'])
    expect(businessCategory?.description).toContain('推荐值')
    expect(businessCategory?.description).toContain('也允许自定义值')
    for (const value of TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES) {
      expect(businessCategory?.description).toContain(value)
    }
  })

  it('does not expose blueprint tools in edit mode', () => {
    const actions = generateToolDefinitions().map(tool => functionNameToAction(tool.function.name))

    expect(actions).not.toContain('blueprint.create')
    expect(actions).not.toContain('blueprint.describe')
    expect(actions).not.toContain('blueprint.revise')
    expect(actions).not.toContain('blueprint.advance')
    expect(actions.every(action => !action.startsWith('blueprint.'))).toBe(true)
  })

  it('exposes core@interaction@ask and validates recommended options', () => {
    const actions = generateToolDefinitions().map(tool => functionNameToAction(tool.function.name))
    expect(actions).toContain('core@interaction@ask')

    const still = getStill('core@interaction@ask')
    expect(still).toBeDefined()
    if (still === undefined) return

    const definition = stillToToolDefinition(still)
    expect(definition.function.parameters.required ?? []).toEqual(expect.arrayContaining(['title', 'questions']))

    const session = createBareSession()
    const invalid = executeStill('core@interaction@ask', {
      title: '确认范围',
      questions: [
        {
          id: 'scope',
          prompt: '选择范围',
          type: 'single',
          options: [
            { id: 'basic', label: '基础' },
            { id: 'workflow', label: '流程' },
          ],
          recommendedOptionIds: ['missing'],
        },
      ],
    }, session, 'ask-invalid')
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) {
      expect(invalid.msg).toContain('不存在的选项')
    }

    const valid = executeStill('core@interaction@ask', {
      title: '确认范围',
      questions: [
        {
          id: 'scope',
          prompt: '选择范围',
          type: 'single',
          options: [
            { id: 'basic', label: '基础' },
            { id: 'workflow', label: '流程' },
          ],
          recommendedOptionIds: ['workflow'],
        },
      ],
    }, session, 'ask-valid')
    expect(valid.ok).toBe(true)
    if (valid.ok) {
      const payload = valid.data as { questions: Array<{ recommendedOptionIds: string[] }> }
      expect(payload.questions[0]?.recommendedOptionIds).toEqual(['workflow'])
    }
  })

  it('exposes only current knowledge FC names', () => {
    const functionNames = generateToolDefinitions().map(tool => tool.function.name)
    expect(functionNames).toContain('core_knowledge_queryTools')
    expect(functionNames).toContain('core_knowledge_guideTool')
    expect(functionNames).toContain('core_knowledge_queryPayloads')
    expect(functionNames).toContain('core_knowledge_guidePayload')
    expect(functionNames).not.toContain('catalog_query')
    expect(functionNames).not.toContain('catalog_guide')
    expect(functionNames).not.toContain('queryComponentCatalog')
    expect(functionNames).not.toContain('queryComponentGuide')

    expect(functionNameToAction('core_knowledge_queryTools')).toBe('core@knowledge@queryTools')
    expect(functionNameToAction('core_knowledge_guidePayload')).toBe('core@knowledge@guidePayload')
  })

  it('keeps core@knowledge definitions business-neutral', () => {
    const coreKnowledgeActions = [
      'core@knowledge@queryTools',
      'core@knowledge@guideTool',
      'core@knowledge@queryPayloads',
      'core@knowledge@guidePayload',
    ]

    for (const action of coreKnowledgeActions) {
      const still = getStill(action)
      expect(still).toBeDefined()
      if (still === undefined) continue

      const serialized = JSON.stringify({
        description: still.description,
        modulePrompt: still.modulePrompt,
        usageRules: still.usageRules,
        paramsSchema: still.paramsSchema,
        resultSchema: still.resultSchema,
        example: still.example,
        failureModes: still.failureModes,
      })
      expect(serialized).not.toMatch(/pageDesign|page-design|SparkNode|r-table|r-text|组件/u)
    }
  })

  it('surfaces module prompts through core@knowledge catalogs', () => {
    const session = createBareSession()
    const result = executeStill('core@knowledge@queryTools', {}, session, 'query-module-prompts')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as QueryToolsResult
    const expectedModules = [
      'core@knowledge',
      'core@session',
      'core@interaction',
      'pageDesign@lifecycle',
      'pageDesign@nodeTree',
      'pageDesign@dataset',
      'pageDesign@textModel',
    ]
    const moduleKeys = data.modules.map(moduleSummary => `${moduleSummary.business}@${moduleSummary.module}`)
    const nodeTreeModule = data.modules.find(moduleSummary => moduleSummary.business === 'pageDesign' && moduleSummary.module === 'nodeTree')
    const addNodeTool = data.tools.find(tool => tool.action === 'pageDesign@nodeTree@addNode')

    expect(moduleKeys).toEqual(expect.arrayContaining(expectedModules))
    expect(data.modules.every(moduleSummary => moduleSummary.prompt.length > 0)).toBe(true)
    for (const moduleSummary of data.modules) {
      const moduleTools = data.tools.filter(tool => tool.business === moduleSummary.business && tool.module === moduleSummary.module)
      expect(moduleTools.length).toBe(moduleSummary.toolCount)
      expect(moduleTools.every(tool => tool.modulePrompt === moduleSummary.prompt)).toBe(true)
    }
    expect(nodeTreeModule?.prompt).toContain('SparkNodeTree')
    expect(nodeTreeModule?.actions).toContain('pageDesign@nodeTree@addNode')
    expect(addNodeTool?.modulePrompt).toBe(nodeTreeModule?.prompt)
  })

  it('includes module prompt in guideTool and FC descriptions', () => {
    const session = createBareSession()
    const guideResult = executeStill(
      'core@knowledge@guideTool',
      { action: 'pageDesign@nodeTree@addNode' },
      session,
      'guide-module-prompt',
    )

    expect(guideResult.ok).toBe(true)
    if (!guideResult.ok) return

    const guide = guideResult.data as KnowledgeToolGuide
    expect(guide.modulePrompt).toContain('queryPayloads/guidePayload')

    const guideStill = getStill('core@knowledge@guideTool')
    expect(guideStill?.resultSchema?.['modulePrompt']).toBeDefined()

    const still = getStill('pageDesign@nodeTree@addNode')
    expect(still).toBeDefined()
    if (still === undefined) return

    const definition = stillToToolDefinition(still)
    expect(definition.function.description).toContain('模块提示')
    expect(definition.function.description).toContain('queryPayloads/guidePayload')
  })
})
