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

function execQuery(params: unknown): StillResult {
  return executeStill('catalog.query', params, session, 'catalog-query-strict')
}

function execGuide(params: unknown): StillResult {
  return executeStill('catalog.guide', params, session, 'catalog-guide-strict')
}

beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerEditStills()
  session = createSession()
})

describe('catalog.query — Component Directory', () => {
  it('loads catalog by default in createSession and returns full list', () => {
    const result = execQuery({})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as Record<string, unknown>
    expect(typeof data['total']).toBe('number')
    expect(Array.isArray(data['components'])).toBe(true)
  })

  it('filters by category', () => {
    const result = execQuery({ category: 'field' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as Record<string, unknown>
    expect(data['category']).toBe('field')
  })

  it('fails fast when session catalog is missing', () => {
    session.catalog = null
    const result = execQuery({})
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.code).toBe('NO_CATALOG')
  })
})

describe('catalog.guide — Component Config Guide', () => {
  it('returns rich config guide for known component', () => {
    const result = execGuide({ type: 'r-text' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as Record<string, unknown>
    expect(data['type']).toBe('r-text')
    expect(Array.isArray(data['requiredProps'])).toBe(true)
    expect(Array.isArray(data['optionalProps'])).toBe(true)
    expect(data['minimalConfig']).toBeDefined()
    expect(Array.isArray(data['failFastChecks'])).toBe(true)
  })

  it('returns NOT_FOUND for unknown component type', () => {
    const result = execGuide({ type: 'r-nonexistent-xyz' })
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.code).toBe('NOT_FOUND')
  })

  it('returns INVALID_PARAMS when type is missing', () => {
    const result = execGuide({})
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.code).toBe('INVALID_PARAMS')
  })
})
