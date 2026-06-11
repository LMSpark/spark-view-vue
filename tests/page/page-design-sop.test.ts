import { describe, expect, it } from 'vitest'
import { buildPageDesignToolLoopNudge } from '@/services/page-design/page-design-sop'

const FIXTURE_PAGE_ID = 'leave-request-page'

describe('buildPageDesignToolLoopNudge', () => {
  it('interpolates pageId without hardcoded business script shape', () => {
    const nudge = buildPageDesignToolLoopNudge('model_script_retry', FIXTURE_PAGE_ID)
    expect(nudge).toContain(FIXTURE_PAGE_ID)
    expect(nudge).toContain('RECOVERY_HINT')
    expect(nudge).not.toContain('createTable')
    expect(nudge).not.toContain('openPageDesign')
  })

  it('nudges execution phase with pageId context only', () => {
    const nudge = buildPageDesignToolLoopNudge('execution_phase', FIXTURE_PAGE_ID)
    expect(nudge).toContain(FIXTURE_PAGE_ID)
    expect(nudge).toContain('model_script')
    expect(nudge).not.toContain('editNodeTree')
  })
})
