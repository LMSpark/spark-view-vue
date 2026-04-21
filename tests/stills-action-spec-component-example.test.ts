import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearDomains,
  clearRegistry,
  createSession,
  executeStill,
  registerEditStills,
  type IStillSession,
  type StillResult,
} from '../packages/spark-ai/src/stills'

let session: IStillSession

function exec(action: string, params: unknown = {}): StillResult {
  return executeStill(action, params, session, 'stills-action-spec-component-example')
}

beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerEditStills()
  session = createSession()
})

describe('stills.actionSpec component example', () => {
  it('rejects component type query and redirects to catalog.query', () => {
    const result = exec('stills.actionSpec', { action: 'r-text' })
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.code).toBe('COMPONENT_QUERY_REQUIRED')
    expect(result.msg).toContain('组件 type')
    expect(result.fix).toContain('catalog.query')
    expect(result.fix).toContain('"type":"r-text"')
  })
})
