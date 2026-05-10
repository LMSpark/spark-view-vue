import { describe, expect, it, vi } from 'vitest'

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    onUnmounted: vi.fn(),
  }
})

vi.mock('@spark-view/spark-utils', () => ({
  createFetchClient: vi.fn(() => ({ post: vi.fn() })),
}))

vi.mock('@/services/http', () => ({
  createAuthHeaders: () => ({}),
}))

import { usePageModelSessionHost } from '../src/views/app/dev-system/usePageModelSessionHost'

describe('usePageModelSessionHost runtime wiring', () => {
  it('starts the page design module runtime used by function execution', async () => {
    const host = usePageModelSessionHost({
      getEditToolHost: () => ({
        getNodeTree: () => ({ toJSON: () => ({ id: 'root', children: [] }) }) as never,
        getDataSetTool: () => ({ toJson: () => ({ tables: {} }) }) as never,
        readScript: () => '',
        readStyle: () => '',
      }),
      getSessionKey: () => 'orders-page',
    })

    const context = await host.ensureSession()
    const bootstrapAction = context.availableFunctions.find(
      item => item.moduleId === 'lifecycle' && item.functionId === 'bootstrap',
    )?.action

    expect(bootstrapAction).toBeTypeOf('string')
    const output = await host.executeFunctionCall({
      scopeKey: context.scopeKey,
      instanceId: context.instanceId,
      action: bootstrapAction as string,
      args: {},
    })

    if (!output.result.ok) {
      throw new Error(output.result.msg)
    }
    expect(output.result.summary).toContain('进入 editing 状态')
  })
})
