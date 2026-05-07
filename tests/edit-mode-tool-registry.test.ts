import { beforeEach, describe, expect, it } from 'vitest'

import {
  functionNameToAction,
  generateToolDefinitions,
} from '../packages/spark-ai/src/core/function/tool-schema'
import {
  isEditDataSetWriteAction,
  isEditWriteAction,
} from '../packages/spark-ai/src/business/page-design'
import { createPageDesignFunctionHarness } from './helpers/page-design-functions'

beforeEach(() => {
  createPageDesignFunctionHarness()
})

describe('edit mode tool registry', () => {
  it('does not expose blueprint tools in edit mode', () => {
    const actions = generateToolDefinitions().map(tool => functionNameToAction(tool.function.name))

    expect(actions).not.toContain('blueprint.create')
    expect(actions).not.toContain('blueprint.describe')
    expect(actions).not.toContain('blueprint.revise')
    expect(actions).not.toContain('blueprint.advance')
    expect(actions.every(action => !action.startsWith('blueprint.'))).toBe(true)
  })

  it('does not treat hidden aggregate catalog rows as edit-mode writes', () => {
    const actions = generateToolDefinitions().map(tool => functionNameToAction(tool.function.name))
    const hiddenAggregateWrites = [
      'pageDesign@dataset@addAggregate',
      'pageDesign@dataset@updateAggregate',
      'pageDesign@dataset@removeAggregate',
    ]

    for (const action of hiddenAggregateWrites) {
      expect(actions).not.toContain(action)
      expect(isEditDataSetWriteAction(action)).toBe(false)
      expect(isEditWriteAction(action)).toBe(false)
    }
  })
})