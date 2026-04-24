import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, shallowRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import type { PageModelSessionHost } from '../src/views/app/dev-system/composables/usePageModelSessionHost'
import { SparkNodeTree } from '../packages/spark-component/src/index'
import { DataSetCrudTool } from '../packages/spark-data/src/index'

const shared = vi.hoisted(() => {
  const runs: Array<{
    options: Record<string, unknown>
    resolve: (value: {
      turns: Array<Record<string, unknown>>
      rounds: number
      aborted: boolean
      completed: boolean
      sessionId: string
    }) => void
  }> = []

  const startIterateSession = vi.fn((options) => {
    return new Promise<{
      turns: Array<Record<string, unknown>>
      rounds: number
      aborted: boolean
      completed: boolean
      sessionId: string
    }>((resolve) => {
      runs.push({
        options: options as Record<string, unknown>,
        resolve,
      })
    })
  })

  return {
    runs,
    startIterateSession,
    generateToolDefinitions: vi.fn(() => []),
  }
})

vi.mock('@/services/http', () => ({
  createAuthHeaders: vi.fn(() => ({})),
}))

vi.mock('@spark-view/spark-ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@spark-view/spark-ai')>()
  return {
    ...actual,
    startIterateSession: shared.startIterateSession,
    generateToolDefinitions: shared.generateToolDefinitions,
  }
})

import {
  bindLiveModelAdapter,
  clearDomains,
  clearRegistry,
  createSession,
  type EditToolHost,
  getEditState,
  registerEditStills,
} from '@spark-view/spark-ai'
import { useRuleEditSession } from '../src/views/app/dev-system/composables/useRuleEditSession'

function createRuleEditHarness(options?: {
  onDataSetChanged?: (tool: DataSetCrudTool) => void
}): {
  editToolHost: EditToolHost
  liveDataSetTool: DataSetCrudTool
  sessionHost: PageModelSessionHost
} {
  clearDomains()
  clearRegistry()
  registerEditStills()

  const session = createSession()
  const liveTree = new SparkNodeTree({ root: { type: 'page', children: [] } })
  const liveDataSet = DataSetCrudTool.fromJson({ dataSetName: 'PageDataSet', tables: {} })
  let script = ''
  let style = ''

  const editToolHost: EditToolHost = {
    getNodeTree: () => liveTree,
    getDataSetTool: () => liveDataSet,
    readScript: () => script,
    writeScript(content: string) {
      script = content
    },
    readStyle: () => style,
    writeStyle(content: string) {
      style = content
    },
    ...(options?.onDataSetChanged ? { onDataSetChanged: options.onDataSetChanged } : {}),
  }

  bindLiveModelAdapter(getEditState(session), editToolHost)

  return {
    editToolHost,
    liveDataSetTool: liveDataSet,
    sessionHost: {
      backend: {} as PageModelSessionHost['backend'],
      session: shallowRef(session),
      ensureSession: () => ({ session, bootstrapped: false }),
      reset: vi.fn(async () => {}),
      resetSync: vi.fn(),
      setBackendSessionId: vi.fn(),
      getResumeSessionOptions: () => ({}),
      hasSessionMismatch: () => false,
    },
  }
}

describe('useRuleEditSession run isolation', () => {
  beforeEach(() => {
    shared.runs.length = 0
    shared.startIterateSession.mockClear()
    shared.generateToolDefinitions.mockClear()
  })

  it('ignores stale SSE events after reset aborts the active run', async () => {
    let api: ReturnType<typeof useRuleEditSession> | null = null
    const harness = createRuleEditHarness()

    const Host = defineComponent({
      setup() {
        api = useRuleEditSession({
          getSessionKey: () => 'orders-page',
          getEditToolHost: () => harness.editToolHost,
          sessionHost: harness.sessionHost,
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
    const firstOnSseEvent = firstRun.options['onSseEvent'] as ((event: { sessionId: string; type: string; data: string }) => void) | undefined
    const firstSignal = firstRun.options['signal'] as AbortSignal
    expect(firstRun.options['repeatDetection']).toEqual({
      maxSameSignature: 6,
      maxConsecutiveErrors: 6,
      maxCyclePeriod: 4,
      cycleRepeatThreshold: 2,
      maxReadOnlyActions: 36,
      maxMissingComponentRetries: 2,
    })

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
      completed: false,
      sessionId: 'old-run',
    })
    await expect(firstRunPromise).resolves.toBeUndefined()

    const secondRunPromise = api!.runLlm('继续删除最后修改人字段')
    await flushPromises()
    expect(shared.runs).toHaveLength(2)

    const secondRun = shared.runs[1]!
    const secondOnSseEvent = secondRun.options['onSseEvent'] as ((event: { sessionId: string; type: string; data: string }) => void) | undefined

    secondOnSseEvent?.({ sessionId: 'new-run', type: 'delta', data: 'fresh-output' })
    secondOnSseEvent?.({
      sessionId: 'new-run',
      type: 'result',
      data: JSON.stringify({ text: 'fresh-output', toolCalls: [] }),
    })

    expect(api!.aiBuffer.value).toBe('')
    expect(api!.log.value.at(-1)?.tag).toBe('LLM 响应')
    expect(api!.log.value.at(-1)?.text).toBe('fresh-output')

    secondRun.resolve({
      turns: [
        {
          round: 1,
          timestamp: new Date().toISOString(),
          phase: 'stills-execute',
          toolBlock: { action: 'datasetTool.createColumn' },
          stillsResult: { ok: true, summary: '已新增列' },
        },
      ],
      rounds: 1,
      aborted: false,
      completed: false,
      sessionId: 'new-run',
    })
    await flushPromises()
    await expect(secondRunPromise).resolves.toBeUndefined()

    wrapper.unmount()
  })

  it('fails fast and drops backend resume session when the model only runs read-only tools', async () => {
    const harness = createRuleEditHarness()
    const sessionHost = harness.sessionHost
    const onStatus = vi.fn()
    let api: ReturnType<typeof useRuleEditSession> | null = null

    const Host = defineComponent({
      setup() {
        api = useRuleEditSession({
          getSessionKey: () => 'orders-page',
          getEditToolHost: () => harness.editToolHost,
          sessionHost,
          onStatus,
        })

        return () => h('div')
      },
    })

    const wrapper = mount(Host)
    expect(api).not.toBeNull()

    const runPromise = api!.runLlm('订单管理加入业务人、客户显示客户名称')
    await flushPromises()
    expect(shared.runs).toHaveLength(1)

    shared.runs[0]!.resolve({
      turns: [
        {
          round: 1,
          timestamp: new Date().toISOString(),
          phase: 'stills-execute',
          toolBlock: { action: 'datasetTool.getTable' },
          stillsResult: { ok: true, summary: '已读取 Orders 表结构' },
        },
      ],
      rounds: 1,
      aborted: false,
      completed: false,
      sessionId: 'read-only-session',
    })

    await expect(runPromise).rejects.toThrow('本轮仅执行了只读工具')

    expect(sessionHost.setBackendSessionId).toHaveBeenCalledWith(null)
    expect(api!.log.value.at(-1)?.tag).toBe('编辑失败')
    expect(api!.log.value.at(-1)?.text).toContain('未对当前页面模型产生写入')
    expect(onStatus).toHaveBeenCalledWith(
      expect.stringContaining('未对当前页面模型产生写入'),
      'error',
    )

    wrapper.unmount()
  })

  it('treats datasetTool writes as page-model writes and resyncs the page dataset tool after the run', async () => {
    const onDataSetChanged = vi.fn()
    const harness = createRuleEditHarness({ onDataSetChanged })
    const liveDataSetTool = harness.liveDataSetTool
    const onStatus = vi.fn()
    let api: ReturnType<typeof useRuleEditSession> | null = null

    const Host = defineComponent({
      setup() {
        api = useRuleEditSession({
          getSessionKey: () => 'orders-page',
          getEditToolHost: () => harness.editToolHost,
          sessionHost: harness.sessionHost,
          onStatus,
        })

        return () => h('div')
      },
    })

    const wrapper = mount(Host)
    expect(api).not.toBeNull()

    const runPromise = api!.runLlm('全部表增加最后修改人')
    await flushPromises()
    expect(shared.runs).toHaveLength(1)

    shared.runs[0]!.resolve({
      turns: [
        {
          round: 1,
          timestamp: new Date().toISOString(),
          phase: 'stills-execute',
          toolBlock: { action: 'datasetTool.createColumn' },
          stillsResult: { ok: true, summary: 'datasetTool.createColumn 完成' },
        },
      ],
      rounds: 1,
      aborted: false,
      completed: true,
      sessionId: 'dataset-run',
    })

    await flushPromises()
    await expect(runPromise).resolves.toBeUndefined()

    expect(onDataSetChanged).toHaveBeenCalledWith(liveDataSetTool)
    expect(api!.dirty.value).toBe(true)
    expect(api!.log.value.at(-1)?.tag).toBe('✅ 已同步')
    expect(api!.log.value.at(-1)?.text).toContain('1 次写操作')
    expect(onStatus).toHaveBeenCalledWith('✅ 模型级编辑完成 (1 轮)', 'success')

    wrapper.unmount()
  })

  it('fails fast and drops backend resume session when the model returns no tool calls', async () => {
    const harness = createRuleEditHarness()
    const sessionHost = harness.sessionHost
    const onStatus = vi.fn()
    let api: ReturnType<typeof useRuleEditSession> | null = null

    const Host = defineComponent({
      setup() {
        api = useRuleEditSession({
          getSessionKey: () => 'orders-page',
          getEditToolHost: () => harness.editToolHost,
          sessionHost,
          onStatus,
        })

        return () => h('div')
      },
    })

    const wrapper = mount(Host)
    expect(api).not.toBeNull()

    const runPromise = api!.runLlm('看看当前页面结构')
    await flushPromises()
    expect(shared.runs).toHaveLength(1)

    shared.runs[0]!.resolve({
      turns: [
        {
          round: 1,
          timestamp: new Date().toISOString(),
          phase: 'ai-response',
          aiText: 'Let me inspect the page first.',
        },
      ],
      rounds: 1,
      aborted: false,
      completed: false,
      sessionId: 'bad-resume-session',
    })

    await expect(runPromise).rejects.toThrow('本轮未触发任何工具调用')

    expect(sessionHost.setBackendSessionId).toHaveBeenCalledWith(null)
    expect(api!.log.value.at(-1)?.tag).toBe('编辑失败')
    expect(api!.log.value.at(-1)?.text).toContain('本轮未触发任何工具调用')
    expect(onStatus).toHaveBeenCalledWith(
      expect.stringContaining('本轮未触发任何工具调用'),
      'error',
    )

    wrapper.unmount()
  })
})