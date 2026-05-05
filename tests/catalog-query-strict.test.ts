import { beforeEach, describe, expect, it } from 'vitest'
import { clearRegistry, executeStill } from '../packages/spark-ai/src/core/stills/dispatcher'
import { clearDomains, createBareSession } from '../packages/spark-ai/src/core/stills/domain'
import type { IStillSession, StillResult } from '../packages/spark-ai/src/core/stills/types'
import { registerPageDesignEditStills } from '../packages/spark-ai/src/business/page-design/register-edit-stills'

let session: IStillSession

function execQuery(params: unknown): StillResult {
  return executeStill('core@knowledge@queryPayloads', params, session, 'knowledge-query-payloads-strict')
}

function execGuide(params: unknown): StillResult {
  return executeStill('core@knowledge@guidePayload', params, session, 'knowledge-guide-payload-strict')
}

beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerPageDesignEditStills()
  session = createBareSession()
})

describe('core@knowledge@queryPayloads — Component Payload Directory', () => {
  it('uses registered page-design payload provider and returns full list', () => {
    const result = execQuery({ payloadRef: 'page-design.component' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as Record<string, unknown>
    expect(typeof data['total']).toBe('number')
    expect(Array.isArray(data['payloads'])).toBe(true)
  })

  it('filters by category', () => {
    const result = execQuery({ payloadRef: 'page-design.component', filter: { category: 'field' } })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as Record<string, unknown>
    const payloads = data['payloads'] as Array<{ category?: string }>
    expect(payloads.length).toBeGreaterThan(0)
    expect(payloads.every(payload => payload.category === 'field')).toBe(true)
  })

  it('rejects wrapped or aliased categories', () => {
    const result = execQuery({ payloadRef: 'page-design.component', filter: { category: { category: 'layout' } } })
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.code).toBe('PAYLOAD_PROVIDER_ERROR')
  })

  it('rejects removed type/componentType shortcuts', () => {
    const byType = execQuery({ type: 'r-table' })
    expect(byType.ok).toBe(false)
    if (!byType.ok) {
      expect(byType.code).toBe('INVALID_PARAMS')
    }

    const byComponentType = execQuery({ componentType: 'r-table' })
    expect(byComponentType.ok).toBe(false)
    if (!byComponentType.ok) {
      expect(byComponentType.code).toBe('INVALID_PARAMS')
    }
  })

  it('keeps component catalog out of core session state', () => {
    expect('catalog' in (session as unknown as Record<string, unknown>)).toBe(false)

    const result = execQuery({ payloadRef: 'page-design.component' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as Record<string, unknown>
    expect(Array.isArray(data['payloads'])).toBe(true)
  })
})

describe('core@knowledge@guidePayload — Component Config Guide', () => {
  it('returns rich config guide for known component', () => {
    const result = execGuide({ payloadRef: 'page-design.component', key: 'r-text' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data as Record<string, unknown>
    expect(data['payloadRef']).toBe('page-design.component')
    expect(data['key']).toBe('r-text')
    expect(data['jsonSchema']).toBeDefined()
    expect(data['minimalExample']).toBeDefined()
    expect(Array.isArray(data['usageRules'])).toBe(true)
  })

  it('returns NOT_FOUND for unknown component type', () => {
    const result = execGuide({ payloadRef: 'page-design.component', key: 'r-nonexistent-xyz' })
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.code).toBe('PAYLOAD_NOT_FOUND')
  })

  it('returns INVALID_PARAMS when type is missing', () => {
    const result = execGuide({})
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.code).toBe('INVALID_PARAMS')
  })

  it('rejects removed componentType params', () => {
    const result = execGuide({ componentType: 'r-table' })
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.code).toBe('INVALID_PARAMS')
  })

  it('does not register removed component query actions', () => {
    const oldCatalogQuery = executeStill('catalog.query', {}, session, 'removed-old-catalog-query')
    expect(oldCatalogQuery.ok).toBe(false)
    if (!oldCatalogQuery.ok) expect(oldCatalogQuery.code).toBe('UNKNOWN_ACTION')

    const oldCatalogGuide = executeStill('catalog.guide', { type: 'r-table' }, session, 'removed-old-catalog-guide')
    expect(oldCatalogGuide.ok).toBe(false)
    if (!oldCatalogGuide.ok) expect(oldCatalogGuide.code).toBe('UNKNOWN_ACTION')

    const oldKnowledgeQuery = executeStill('knowledge.queryPayloads', {}, session, 'removed-dot-knowledge-query')
    expect(oldKnowledgeQuery.ok).toBe(false)
    if (!oldKnowledgeQuery.ok) expect(oldKnowledgeQuery.code).toBe('UNKNOWN_ACTION')

    const oldKnowledgeGuide = executeStill('knowledge.guidePayload', { payloadRef: 'page-design.component', key: 'r-table' }, session, 'removed-dot-knowledge-guide')
    expect(oldKnowledgeGuide.ok).toBe(false)
    if (!oldKnowledgeGuide.ok) expect(oldKnowledgeGuide.code).toBe('UNKNOWN_ACTION')

    const catalog = executeStill('queryComponentCatalog', {}, session, 'removed-catalog-action')
    expect(catalog.ok).toBe(false)
    if (!catalog.ok) expect(catalog.code).toBe('UNKNOWN_ACTION')

    const guide = executeStill('queryComponentGuide', { type: 'r-table' }, session, 'removed-guide-action')
    expect(guide.ok).toBe(false)
    if (!guide.ok) expect(guide.code).toBe('UNKNOWN_ACTION')
  })
})
