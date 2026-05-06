import { beforeEach, describe, expect, it } from 'vitest'

import {
  functionNameToAction,
  functionToToolDefinition,
  generateToolDefinitions,
  getFunctionDefinition,
  type KnowledgeModuleSummary,
  type KnowledgeToolGuide,
  type KnowledgeToolSummary,
} from '../packages/spark-ai/src'
import {
  TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES,
  TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES,
} from '../packages/spark-data/src'
import type { FunctionResult } from '@spark-view/spark-ai'
import { createPageDesignFunctionHarness } from './helpers/page-design-functions'

interface QueryToolsResult {
  modules: KnowledgeModuleSummary[]
  tools: KnowledgeToolSummary[]
  total: number
  hint: string
}

let exec: (action: string, params?: unknown, requestId?: string) => FunctionResult

beforeEach(() => {
  exec = createPageDesignFunctionHarness().exec
})

describe('tool-calling schema generation', () => {
  it('keeps nested object schema for pageDesign@nodeTree@addNode', () => {
    const functionDefinition = getFunctionDefinition('pageDesign@nodeTree@addNode')
    expect(functionDefinition).toBeDefined()
    if (functionDefinition === undefined) return

    const definition = functionToToolDefinition(functionDefinition)
    const parameters = definition.function.parameters

    expect(parameters.required ?? []).toContain('node')

    const nodeProp = parameters.properties['node']
    expect(nodeProp?.type).toBe('object')
    expect(nodeProp?.required ?? []).toContain('type')
    expect(nodeProp?.properties?.['type']?.type).toBe('string')
  })

  it('keeps parentComponentId optional for pageDesign@nodeTree@listChildren', () => {
    const functionDefinition = getFunctionDefinition('pageDesign@nodeTree@listChildren')
    expect(functionDefinition).toBeDefined()
    if (functionDefinition === undefined) return

    const definition = functionToToolDefinition(functionDefinition)
    const parameters = definition.function.parameters

    expect(parameters.required ?? []).not.toContain('parentComponentId')
    expect(parameters.properties['parentComponentId']?.type).toEqual(['string', 'null'])
  })

  it('surfaces open-ended enum hints for pageDesign@dataset@updateTable semantic fields', () => {
    const functionDefinition = getFunctionDefinition('pageDesign@dataset@updateTable')
    expect(functionDefinition).toBeDefined()
    if (functionDefinition === undefined) return

    const definition = functionToToolDefinition(functionDefinition)
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

  it('exposes core@knowledge@ask and validates recommended options', () => {
    const actions = generateToolDefinitions().map(tool => functionNameToAction(tool.function.name))
    expect(actions).toContain('core@knowledge@ask')

    const functionDefinition = getFunctionDefinition('core@knowledge@ask')
    expect(functionDefinition).toBeDefined()
    if (functionDefinition === undefined) return

    const definition = functionToToolDefinition(functionDefinition)
    expect(definition.function.parameters.required ?? []).toEqual(expect.arrayContaining(['title', 'questions']))

    const invalid = exec('core@knowledge@ask', {
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
    }, 'ask-invalid')
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) {
      expect(invalid.msg).toContain('不存在的选项')
    }

    const valid = exec('core@knowledge@ask', {
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
    }, 'ask-valid')
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
    expect(functionNames).toContain('core_knowledge_ask')
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
      'core@knowledge@ask',
    ]

    for (const action of coreKnowledgeActions) {
      const functionDefinition = getFunctionDefinition(action)
      expect(functionDefinition).toBeDefined()
      if (functionDefinition === undefined) continue

      const serialized = JSON.stringify({
        description: functionDefinition.description,
        modulePrompt: functionDefinition.modulePrompt,
        usageRules: functionDefinition.usageRules,
        paramsSchema: functionDefinition.paramsSchema,
        resultSchema: functionDefinition.resultSchema,
        example: functionDefinition.example,
        failureModes: functionDefinition.failureModes,
      })
      expect(serialized).not.toMatch(/pageDesign|page-design|SparkNode|r-table|r-text|组件/u)
    }
  })

  it('surfaces module prompts through core@knowledge catalogs', () => {
    const result = exec('core@knowledge@queryTools', {}, 'query-module-prompts')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as QueryToolsResult
    const expectedModules = [
      'core@knowledge',
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
    const guideResult = exec(
      'core@knowledge@guideTool',
      { action: 'pageDesign@nodeTree@addNode' },
      'guide-module-prompt',
    )

    expect(guideResult.ok).toBe(true)
    if (!guideResult.ok) return

    const guide = guideResult.data as KnowledgeToolGuide
    expect(guide.modulePrompt).toContain('queryPayloads/guidePayload')

    const guideFunction = getFunctionDefinition('core@knowledge@guideTool')
    expect(guideFunction?.resultSchema?.['modulePrompt']).toBeDefined()

    const definition = generateToolDefinitions({ actions: ['pageDesign@nodeTree@addNode'] })[0]
    expect(definition).toBeDefined()
    if (definition === undefined) return

    expect(definition.function.description).toContain('模块提示')
    expect(definition.function.description).toContain('queryPayloads/guidePayload')
  })
})
