import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageEditor } from '@spark-view/spark-page-config/editor'
import { runPageDesignAiSession } from '@/services/page-design-ai-runner'

const mocks = vi.hoisted(() => {
  const aiAgentHostKey = Symbol('AI_AGENT_HOST')
  const pageDesignRun = vi.fn(async () => undefined)
  return {
    aiAgentHostKey,
    pageDesignRun,
    ensurePageDesignBusiness: vi.fn(() => ({ run: pageDesignRun })),
  }
})

vi.mock('@spark-view/spark-ai/agent', () => ({
  AI_AGENT_HOST: mocks.aiAgentHostKey,
}))

vi.mock('@spark-view/spark-page-config/ai', () => ({
  PAGE_DESIGN_MODULE_ID: 'pageDesign',
  ensurePageDesignBusiness: mocks.ensurePageDesignBusiness,
}))

function createEditor(activePage: { pageId: string; isLoaded: boolean } | null): PageEditor {
  return {
    getActivePage: vi.fn(() => activePage),
    setActivePage: vi.fn(),
    ensureActivePageFilesLoaded: vi.fn(),
    createPageDesignEditHost: vi.fn(() => ({})),
  } as unknown as PageEditor
}

describe('runPageDesignAiSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the already loaded active PageModel instead of loading files on AI click', async () => {
    const editor = createEditor({ pageId: 'orders', isLoaded: true })
    const aiHost = {}

    const result = await runPageDesignAiSession({
      pageId: 'orders',
      userRequirement: '补一个按钮',
      editor,
      consumeCapability: ((key: unknown) => key === mocks.aiAgentHostKey ? aiHost : null) as never,
    })

    expect(result).toEqual({ sawToolCall: false })
    expect(editor.setActivePage).not.toHaveBeenCalled()
    expect(editor.ensureActivePageFilesLoaded).not.toHaveBeenCalled()
    expect(mocks.ensurePageDesignBusiness).toHaveBeenCalledWith(expect.objectContaining({ host: aiHost }))
    expect(mocks.pageDesignRun).toHaveBeenCalledWith('pageDesign', {
      pageId: 'orders',
      userRequirement: '补一个按钮',
    }, expect.any(Object))
  })

  it('fails fast when the active PageModel is not loaded', async () => {
    const editor = createEditor({ pageId: 'orders', isLoaded: false })

    await expect(runPageDesignAiSession({
      pageId: 'orders',
      userRequirement: '补一个按钮',
      editor,
      consumeCapability: (() => ({})) as never,
    })).rejects.toThrow('requires PageModel "orders" to be loaded')

    expect(editor.ensureActivePageFilesLoaded).not.toHaveBeenCalled()
  })
})
