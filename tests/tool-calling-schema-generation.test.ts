import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearDomains,
  clearRegistry,
  registerEditStills,
} from '../packages/spark-ai/src/stills'
import {
  TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES,
  TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES,
} from '../packages/spark-data/src'
import { getStill } from '../packages/spark-ai/src/stills/dispatcher'
import { functionNameToAction, generateToolDefinitions, stillToToolDefinition } from '../packages/spark-ai/src/fc-schema'

beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerEditStills()
})

describe('tool-calling schema generation', () => {
  it('keeps nested object schema for sparkNodeTree.addNode', () => {
    const still = getStill('sparkNodeTree.addNode')
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

  it('keeps parentComponentId optional for sparkNodeTree.listChildren', () => {
    const still = getStill('sparkNodeTree.listChildren')
    expect(still).toBeDefined()
    if (still === undefined) return

    const definition = stillToToolDefinition(still)
    const parameters = definition.function.parameters

    expect(parameters.required ?? []).not.toContain('parentComponentId')
    expect(parameters.properties['parentComponentId']?.type).toBe('string')
  })

  it('surfaces open-ended enum hints for datasetTool.updateTable semantic fields', () => {
    const still = getStill('datasetTool.updateTable')
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
})
