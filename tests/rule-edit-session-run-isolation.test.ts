import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, shallowRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import type { PageModelSessionHost } from '../src/views/app/dev-system/composables/usePageModelSessionHost'

const shared = vi.hoisted(() => {
  const runs: Array<{
    config: Record<string, unknown>
    resolve: (value: {
      turns: Array<Record<string, unknown>>
      rounds: number
      aborted: boolean
      exportCompleted: boolean
      sessionId: string
    }) => void
  }> = []

  const runStillsLoop = vi.fn((_prompt, _session, _backend, config) => {
    return new Promise<{
      turns: Array<Record<string, unknown>>
      rounds: number
      aborted: boolean
      exportCompleted: boolean
      sessionId: string
    }>((resolve) => {
      runs.push({
        config: config as Record<string, unknown>,
        resolve,
      })
    })
  })

  return {
    runs,
    runStillsLoop,
    configureSessionBackend: vi.fn(),
    createRepeatDetectionMonitor: vi.fn(() => ({
      name: 'repeat-detection',
      afterStillExecution: () => [],
      shouldAbort: () => ({ abort: false }),
    })),
    generateToolDefinitions: vi.fn(() => []),
    getEditState: vi.fn(() => ({})),
    getActiveNodeTree: vi.fn(() => null),
  }
})

vi.mock('@/services/http', () => ({
  createAuthHeaders: vi.fn(() => ({})),
}))

vi.mock('@spark-view/spark-ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@spark-view/spark-ai')>()
  return {
    ...actual,
    runStillsLoop: shared.runStillsLoop,
    configureSessionBackend: shared.configureSessionBackend,
    createRepeatDetectionMonitor: shared.createRepeatDetectionMonitor,
    generateToolDefinitions: shared.generateToolDefinitions,
    getEditState: shared.getEditState,
    getActiveNodeTree: shared.getActiveNodeTree,
  }
})

import { useRuleEditSession } from '../src/views/app/dev-system/composables/useRuleEditSession'

function createSessionHost(): PageModelSessionHost {
  return {
    backend: {} as PageModelSessionHost['backend'],
    session: shallowRef(null),
    ensureSession: () => ({ session: {} as never, bootstrapped: false }),
    reset: vi.fn(async () => {}),
    resetSync: vi.fn(),
    setBackendSessionId: vi.fn(),
    getResumeSessionOptions: () => ({}),
    hasSessionMismatch: () => false,
  }
}

describe('useRuleEditSession run isolation', () => {
  beforeEach(() => {
    shared.runs.length = 0
    shared.runStillsLoop.mockClear()
    shared.configureSessionBackend.mockClear()
    shared.createRepeatDetectionMonitor.mockClear()
    shared.generateToolDefinitions.mockClear()
    shared.getEditState.mockClear()
    shared.getActiveNodeTree.mockClear()
  })

  it('ignores stale SSE events after reset aborts the active run', async () => {
    let api: ReturnType<typeof useRuleEditSession> | null = null

    const Host = defineComponent({
      setup() {
        api = useRuleEditSession({
          getSessionKey: () => 'orders-page',
          getLiveModelAdapter: () => ({
            getNodeTree: () => null,
            getDataSetTool: () => null,
            readScript: () => '',
            writeScript: vi.fn(),
            readStyle: () => '',
            writeStyle: vi.fn(),
          }),
          sessionHost: createSessionHost(),
          onStatus: vi.fn(),
        })

        return () => h('div')
      },
    })

    const wrapper = mount(Host)
    expect(api).not.toBeNull()

    const firstRunPromise = api!.runLlm('删除最后修改人字段')
    await flushPromises()
    expect(shared.runs).toHaveLength(1)

    const firstRun = shared.runs[0]!
    const firstOnSseEvent = firstRun.config['onSseEvent'] as ((event: { sessionId: string; type: string; data: string }) => void) | undefined
    const firstSignal = firstRun.config['signal'] as AbortSignal

    firstOnSseEvent?.({ sessionId: 'old-run', type: 'delta', data: 'before-reset' })
    expect(api!.aiBuffer.value).toBe('before-reset')

    api!.reset()
    expect(firstSignal.aborted).toBe(true)
    expect(api!.aiBuffer.value).toBe('')
    expect(api!.log.value).toEqual([])

    firstOnSseEvent?.({ sessionId: 'old-run', type: 'delta', data: 'stale-after-reset' })
    firstOnSseEvent?.({
      sessionId: 'old-run',
      type: 'result',
      data: JSON.stringify({ text: 'should-not-appear', toolCalls: [] }),
    })
    expect(api!.aiBuffer.value).toBe('')
    expect(api!.log.value).toEqual([])

    firstRun.resolve({
      turns: [],
      rounds: 1,
      aborted: false,
      exportCompleted: false,
      sessionId: 'old-run',
    })
    await expect(firstRunPromise).resolves.toBeUndefined()

    const secondRunPromise = api!.runLlm('继续删除最后修改人字段')
    await flushPromises()
    expect(shared.runs).toHaveLength(2)

    const secondRun = shared.runs[1]!
    const secondOnSseEvent = secondRun.config['onSseEvent'] as ((event: { sessionId: string; type: string; data: string }) => void) | undefined

    secondOnSseEvent?.({ sessionId: 'new-run', type: 'delta', data: 'fresh-output' })
    secondOnSseEvent?.({
      sessionId: 'new-run',
      type: 'result',
      data: JSON.stringify({ text: 'fresh-output', toolCalls: [] }),
    })

    expect(api!.aiBuffer.value).toBe('')
    expect(api!.log.value[0]?.tag).toBe('LLM 响应')
    expect(api!.log.value[0]?.text).toBe('fresh-output')

    secondRun.resolve({
      turns: [
        {
          round: 1,
          timestamp: new Date().toISOString(),
          phase: 'ai-response',
          aiText: '已完成。',
        },
      ],
      rounds: 1,
      aborted: false,
      exportCompleted: false,
      sessionId: 'new-run',
    })
    await flushPromises()
    await expect(secondRunPromise).resolves.toBeUndefined()

    wrapper.unmount()
  })
})