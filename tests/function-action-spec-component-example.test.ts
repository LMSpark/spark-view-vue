import { beforeEach, describe, expect, it } from 'vitest'
import { actionToFunctionName } from '../packages/spark-ai/src/core/function/tool-schema'
import type { FunctionResult } from '../packages/spark-ai/src/core/function/contracts'
import { createPageDesignFunctionHarness } from './helpers/page-design-functions'

let harnessExec: (action: string, params?: unknown, requestId?: string) => FunctionResult

function exec(action: string, params: unknown = {}): FunctionResult {
  return harnessExec(action, params, 'function-action-spec-component-example')
}

beforeEach(() => {
  harnessExec = createPageDesignFunctionHarness().exec
})

describe('core@knowledge@guideTool component example', () => {
  it('rejects component payload key query and redirects to core@knowledge@guidePayload', () => {
    const result = exec('core@knowledge@guideTool', { action: 'r-text' })
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.code).toBe('PAYLOAD_QUERY_REQUIRED')
    expect(result.msg).toContain('参数荷载 key')
    expect(result.fix).toContain('core@knowledge@guidePayload')
    expect(result.fix).toContain('key:"r-text"')
  })

  it('accepts FC function names and resolves them to canonical actions', () => {
    const result = exec('core@knowledge@guideTool', { action: actionToFunctionName('pageDesign@dataset@deleteColumn') })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect((result.data as { action?: string }).action).toBe('pageDesign@dataset@deleteColumn')
    expect(result.summary).toContain('pageDesign@dataset@deleteColumn')
  })
})
