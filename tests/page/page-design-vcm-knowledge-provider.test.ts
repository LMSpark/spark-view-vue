import { describe, expect, it } from 'vitest'
import { createPageDesignVcmKnowledgeProvider } from '@/services/page-design/page-design-vcm-knowledge-provider'

describe('createPageDesignVcmKnowledgeProvider', () => {
  it('uses inline ClassModelKnowledgeService when Worker is unavailable', async () => {
    const provider = createPageDesignVcmKnowledgeProvider()
    const result = await provider.query({ includeMembers: false, keyword: 'config-page' })

    expect(result).toEqual(expect.objectContaining({
      models: expect.arrayContaining([
        expect.objectContaining({ kind: 'config-page' }),
      ]),
    }))
  })
})
