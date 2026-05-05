import { beforeEach, describe, expect, it } from 'vitest'

import {
  functionNameToAction,
  generateToolDefinitions,
} from '@spark-view/spark-ai'
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
})