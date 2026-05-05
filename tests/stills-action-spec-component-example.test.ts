import { beforeEach, describe, expect, it } from 'vitest'
import { clearRegistry, executeStill } from '../packages/spark-ai/src/core/stills/dispatcher'
import { clearDomains, createBareSession } from '../packages/spark-ai/src/core/stills/domain'
import type { IStillSession, StillResult } from '../packages/spark-ai/src/core/stills/types'
import { registerPageDesignEditStills } from '../packages/spark-ai/src/business/page-design/register-edit-stills'
import { actionToFunctionName } from '../packages/spark-ai/src/core/fc-schema'

let session: IStillSession

function exec(action: string, params: unknown = {}): StillResult {
  return executeStill(action, params, session, 'stills-action-spec-component-example')
}

beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerPageDesignEditStills()
  session = createBareSession()
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

  it('accepts FC function names and resolves them to canonical still actions', () => {
    const result = exec('core@knowledge@guideTool', { action: actionToFunctionName('pageDesign@dataset@deleteColumn') })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect((result.data as { action?: string }).action).toBe('pageDesign@dataset@deleteColumn')
    expect(result.summary).toContain('pageDesign@dataset@deleteColumn')
  })
})
