import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearDomains,
  clearRegistry,
  registerEditStills,
} from '../packages/spark-ai/src/stills'
import { getStill } from '../packages/spark-ai/src/stills/dispatcher'
import { stillToToolDefinition } from '../packages/spark-ai/src/tool-calling'

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
})
