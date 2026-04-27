/**
 * Session Orchestrator + Monitors — 单元测试
 *
 * 测试策略：
 * - Monitors 测试纯逻辑（不涉及 LLM）
 * - Orchestrator 测试用 mock SessionBackend + mock dispatch
 * - 聚焦编排层关注点：终止、followUp 注入、终局推动
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerAllStills,
  clearRegistry,
  clearDomains,
  createSession,
  executeStill,
  createRepeatDetectionMonitor,
  createBlueprintOrchestrationMonitor,
  createTerminalActionsMonitor,
  createExportCompletionMonitor,
  runStillsLoop,
  formatWarningsAsFollowUp,
  createDefaultFollowUpPolicy,
  actionToFunctionName,
  dispatchToolCall,
  type IStillSession,
  type StillResult,
  type PostValidationWarning,
} from '@spark-view/spark-ai'
import type {
  ToolCall,
  FcDispatchResult,
  MonitorContext,
  DialogueTurn,
  SessionBackend,
  LlmResponse,
} from '@spark-view/spark-ai'

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

let session: IStillSession
let reqSeq = 0

function exec(action: string, params: unknown = {}): StillResult {
  reqSeq++
  return executeStill(action, params, session, `r${reqSeq}`)
}

function makeTurn(overrides: Partial<DialogueTurn> = {}): DialogueTurn {
  return {
    round: 1,
    timestamp: new Date().toISOString(),
    phase: 'stills-execute',
    toolBlock: { action: 'dataset.bootstrap', id: 'r1', params: {} },
    stillsResult: { ok: true, summary: 'done' },
    ...overrides,
  }
}

function makeCtx(overrides: Partial<MonitorContext> = {}): MonitorContext {
  const turn = makeTurn()
  return {
    session,
    currentTurn: turn,
    allTurns: [turn],
    round: 1,
    params: {},
    result: { ok: true, data: {}, summary: 'done' } as StillResult,
    ...overrides,
  }
}

function okResult(summary = 'done'): StillResult {
  return { ok: true, data: {}, summary }
}

function failResult(code = 'TEST_ERR', msg = 'test error', fix = 'fix it'): StillResult {
  return { ok: false, code, msg, fix }
}

// ═══════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════

beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerAllStills()
  session = createSession()
  reqSeq = 0
})

// ═══════════════════════════════════════════════════════════
// Repeat Detection Monitor
// ═══════════════════════════════════════════════════════════

describe('repeat-detection-monitor', () => {
  it('allows different actions without aborting', () => {
    const monitor = createRepeatDetectionMonitor()

    const actions = ['dataset.bootstrap', 'datatable.create', 'datatable.addColumns']
    for (const action of actions) {
      const ctx = makeCtx({
        currentTurn: makeTurn({ toolBlock: { action, id: 'r1', params: {} } }),
      })
      monitor.afterStillExecution(ctx)
      const abort = monitor.shouldAbort!(ctx)
      expect(abort.abort).toBe(false)
    }
  })

  it('aborts after same signature repeated 3 times', () => {
    const monitor = createRepeatDetectionMonitor({ maxSameSignature: 3 })
    const params = { tableName: 'Users' }

    for (let i = 0; i < 3; i++) {
      const ctx = makeCtx({
        currentTurn: makeTurn({ toolBlock: { action: 'datatable.create', id: `r${i}`, params } }),
        params,
      })
      monitor.afterStillExecution(ctx)

      if (i < 2) {
        expect(monitor.shouldAbort!(ctx).abort).toBe(false)
      } else {
        const result = monitor.shouldAbort!(ctx)
        expect(result.abort).toBe(true)
        expect(result.reason).toContain('datatable.create')
        expect(result.reason).toContain('3')
      }
    }
  })

  it('resets counter when action changes', () => {
    const monitor = createRepeatDetectionMonitor({ maxSameSignature: 3 })

    // 2 times same action
    for (let i = 0; i < 2; i++) {
      const ctx = makeCtx({
        currentTurn: makeTurn({ toolBlock: { action: 'datatable.create', id: `r${i}`, params: { tableName: 'A' } } }),
        params: { tableName: 'A' },
      })
      monitor.afterStillExecution(ctx)
    }

    // Different action breaks the chain
    const diffCtx = makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'relation.add', id: 'r9', params: {} } }),
    })
    monitor.afterStillExecution(diffCtx)
    expect(monitor.shouldAbort!(diffCtx).abort).toBe(false)

    // Same action again — counter restarted at 1
    const retryCtx = makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'datatable.create', id: 'r10', params: { tableName: 'A' } } }),
      params: { tableName: 'A' },
    })
    monitor.afterStillExecution(retryCtx)
    expect(monitor.shouldAbort!(retryCtx).abort).toBe(false)
  })

  it('aborts after 3 consecutive errors', () => {
    const monitor = createRepeatDetectionMonitor({ maxConsecutiveErrors: 3 })

    for (let i = 0; i < 3; i++) {
      const ctx = makeCtx({
        currentTurn: makeTurn({ toolBlock: { action: `action${i}`, id: `r${i}`, params: {} } }),
        result: failResult(),
      })
      monitor.afterStillExecution(ctx)

      if (i < 2) {
        expect(monitor.shouldAbort!(ctx).abort).toBe(false)
      } else {
        const result = monitor.shouldAbort!(ctx)
        expect(result.abort).toBe(true)
        expect(result.reason).toContain('连续')
        expect(result.reason).toContain('3')
      }
    }
  })

  it('resets error counter on success', () => {
    const monitor = createRepeatDetectionMonitor({ maxConsecutiveErrors: 3 })

    // 2 errors (use different actions to avoid same-signature abort)
    for (let i = 0; i < 2; i++) {
      const ctx = makeCtx({
        currentTurn: makeTurn({ toolBlock: { action: `err-action-${i}`, id: `e${i}`, params: {} } }),
        result: failResult(),
      })
      monitor.afterStillExecution(ctx)
    }

    // 1 success resets error counter
    const okCtx = makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'ok-action', id: 'ok1', params: {} } }),
      result: okResult(),
    })
    monitor.afterStillExecution(okCtx)
    expect(monitor.shouldAbort!(okCtx).abort).toBe(false)

    // 2 more errors — still should not abort (counter was reset)
    for (let i = 0; i < 2; i++) {
      const ctx = makeCtx({
        currentTurn: makeTurn({ toolBlock: { action: `err2-action-${i}`, id: `e2-${i}`, params: {} } }),
        result: failResult(),
      })
      monitor.afterStillExecution(ctx)
      expect(monitor.shouldAbort!(ctx).abort).toBe(false)
    }
  })

  it('afterStillExecution returns empty array (no followUp)', () => {
    const monitor = createRepeatDetectionMonitor()
    const ctx = makeCtx()
    expect(monitor.afterStillExecution(ctx)).toEqual([])
  })

  it('injects followUp on period-2 action cycle (A→B repeated 3 times) instead of aborting', () => {
    const monitor = createRepeatDetectionMonitor({ cycleRepeatThreshold: 3 })
    const actions = ['sparkNodeTree.listChildren', 'sparkNodeTree.getNode']
    let lastFollowUp: string[] = []

    // 交替执行 3 个完整周期 = 6 次调用
    for (let i = 0; i < 6; i++) {
      const action = actions[i % 2]!
      // 每次用不同 params，确保同签名检测不会先触发
      const ctx = makeCtx({
        currentTurn: makeTurn({ toolBlock: { action, id: `r${i}`, params: { componentId: `node-${i}` } } }),
        params: { componentId: `node-${i}` },
        result: okResult(),
      })
      lastFollowUp = monitor.afterStillExecution(ctx)
      const abort = monitor.shouldAbort!(ctx)

      expect(abort.abort).toBe(false)
      if (i < 5) expect(lastFollowUp).toEqual([])
    }

    expect(lastFollowUp.length).toBe(1)
    expect(lastFollowUp[0]).toContain('系统循环修复提醒')
    expect(lastFollowUp[0]).toContain('不要重复原动作序列')
  })

  it('does not treat same-action scans as period cycle', () => {
    const monitor = createRepeatDetectionMonitor({ cycleRepeatThreshold: 3 })

    // 连续 catalog.guide 查询不同 type 是正常目录扫描，不应被周期循环规则误伤。
    const types = ['r-date', 'r-text', 'r-select', 'r-table', 'r-button', 'r-space']
    for (let i = 0; i < types.length; i++) {
      const ctx = makeCtx({
        currentTurn: makeTurn({
          toolBlock: { action: 'catalog.guide', id: `g${i}`, params: { type: types[i] } },
        }),
        params: { type: types[i] },
        result: okResult(),
      })
      monitor.afterStillExecution(ctx)
      expect(monitor.shouldAbort!(ctx).abort).toBe(false)
    }
  })

  it('does not abort when actions are genuinely different', () => {
    const monitor = createRepeatDetectionMonitor({ cycleRepeatThreshold: 3 })
    const actions = [
      'sparkNodeTree.listChildren',
      'sparkNodeTree.getNode',
      'sparkNodeTree.setProps',
      'sparkNodeTree.addNode',
      'sparkNodeTree.removeNode',
      'dataset.export',
    ]

    for (let i = 0; i < actions.length; i++) {
      const ctx = makeCtx({
        currentTurn: makeTurn({ toolBlock: { action: actions[i]!, id: `r${i}`, params: {} } }),
        result: okResult(),
      })
      monitor.afterStillExecution(ctx)
      expect(monitor.shouldAbort!(ctx).abort).toBe(false)
    }
  })

  it('nudges but does not abort after many read-only actions', () => {
    const monitor = createRepeatDetectionMonitor({ maxReadOnlyActions: 2, maxSameSignature: 99 })
    const actions = ['catalog.query', 'catalog.guide', 'dataset.export', 'sparkNodeTree.countNodes']
    let lastFollowUp: string[] = []

    for (let i = 0; i < actions.length; i++) {
      const ctx = makeCtx({
        currentTurn: makeTurn({ toolBlock: { action: actions[i]!, id: `r${i}`, params: { i } } }),
        params: { i },
        result: okResult(),
      })
      lastFollowUp = monitor.afterStillExecution(ctx)
      expect(monitor.shouldAbort!(ctx).abort).toBe(false)
    }

    expect(lastFollowUp).toHaveLength(1)
    expect(lastFollowUp[0]).toContain('系统执行节奏提醒')
  })

  it('can abort after too many read-only actions when configured', () => {
    const monitor = createRepeatDetectionMonitor({
      maxReadOnlyActions: 2,
      abortOnReadOnlyLimit: true,
      maxSameSignature: 99,
    })
    const actions = ['catalog.query', 'catalog.guide']
    let abort: { abort: boolean; reason?: string; outcome?: 'aborted' | 'completed' } = { abort: false }

    for (let i = 0; i < actions.length; i++) {
      const ctx = makeCtx({
        currentTurn: makeTurn({ toolBlock: { action: actions[i]!, id: `ro${i}`, params: { i } } }),
        params: { i },
        result: okResult(),
      })
      monitor.afterStillExecution(ctx)
      abort = monitor.shouldAbort!(ctx)
    }

    expect(abort.abort).toBe(true)
    expect(abort.reason).toContain('只读工具调用')
  })

  it('injects followUp on period-3 action cycle instead of aborting', () => {
    const monitor = createRepeatDetectionMonitor({ maxCyclePeriod: 3, cycleRepeatThreshold: 3 })
    const actions = ['A', 'B', 'C']
    let lastFollowUp: string[] = []

    for (let i = 0; i < 9; i++) {
      const action = actions[i % 3]!
      const ctx = makeCtx({
        currentTurn: makeTurn({ toolBlock: { action, id: `r${i}`, params: { v: i } } }),
        params: { v: i },
        result: okResult(),
      })
      lastFollowUp = monitor.afterStillExecution(ctx)
      const abort = monitor.shouldAbort!(ctx)
      expect(abort.abort).toBe(false)
      if (i < 8) expect(lastFollowUp).toEqual([])
    }

    expect(lastFollowUp.length).toBe(1)
    expect(lastFollowUp[0]).toContain('系统循环修复提醒')
  })
})

// ═══════════════════════════════════════════════════════════
// Blueprint Orchestration Monitor
// ═══════════════════════════════════════════════════════════

describe('blueprint-orchestration-monitor', () => {
  it('does not inject followUp before blueprint creation', () => {
    const monitor = createBlueprintOrchestrationMonitor()
    const ctx = makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'datatable.create', id: 'r1', params: {} } }),
    })
    expect(monitor.afterStillExecution(ctx)).toEqual([])
  })

  it('injects followUp when writing after blueprint.create without review', () => {
    const monitor = createBlueprintOrchestrationMonitor()

    // Blueprint created
    const createCtx = makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'blueprint.create', id: 'r1', params: {} } }),
      result: okResult(),
    })
    monitor.afterStillExecution(createCtx)

    // Immediate write — no review first
    const writeCtx = makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'datatable.create', id: 'r2', params: {} } }),
      result: okResult(),
    })
    const followUp = monitor.afterStillExecution(writeCtx)
    expect(followUp.length).toBe(1)
    expect(followUp[0]).toContain('蓝图编排提醒')
    expect(followUp[0]).toContain('blueprint.describe')
  })

  it('does not inject followUp after blueprint.describe review', () => {
    const monitor = createBlueprintOrchestrationMonitor()

    // Blueprint created
    monitor.afterStillExecution(makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'blueprint.create', id: 'r1', params: {} } }),
      result: okResult(),
    }))

    // Blueprint reviewed
    monitor.afterStillExecution(makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'blueprint.describe', id: 'r2', params: {} } }),
      result: okResult(),
    }))

    // Now write — should be clean
    const followUp = monitor.afterStillExecution(makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'datatable.addColumns', id: 'r3', params: {} } }),
      result: okResult(),
    }))
    expect(followUp).toEqual([])
  })

  it('resets review flag on new blueprint.create', () => {
    const monitor = createBlueprintOrchestrationMonitor()

    // Create + review
    monitor.afterStillExecution(makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'blueprint.create', id: 'r1', params: {} } }),
      result: okResult(),
    }))
    monitor.afterStillExecution(makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'blueprint.describe', id: 'r2', params: {} } }),
      result: okResult(),
    }))

    // New blueprint.create → review reset
    monitor.afterStillExecution(makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'blueprint.create', id: 'r3', params: {} } }),
      result: okResult(),
    }))

    // Write without re-review → warning
    const followUp = monitor.afterStillExecution(makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'relation.add', id: 'r4', params: {} } }),
      result: okResult(),
    }))
    expect(followUp.length).toBe(1)
    expect(followUp[0]).toContain('蓝图编排提醒')
  })

  it('does not warn on failed write actions', () => {
    const monitor = createBlueprintOrchestrationMonitor()

    // Blueprint created (no review)
    monitor.afterStillExecution(makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'blueprint.create', id: 'r1', params: {} } }),
      result: okResult(),
    }))

    // Failed write — no warning (failed actions are already handled by error followUp)
    const followUp = monitor.afterStillExecution(makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'datatable.create', id: 'r2', params: {} } }),
      result: failResult(),
    }))
    expect(followUp).toEqual([])
  })

  it('treats blueprint.revise as a review action', () => {
    const monitor = createBlueprintOrchestrationMonitor()

    monitor.afterStillExecution(makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'blueprint.create', id: 'r1', params: {} } }),
      result: okResult(),
    }))
    monitor.afterStillExecution(makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'blueprint.revise', id: 'r2', params: {} } }),
      result: okResult(),
    }))

    const followUp = monitor.afterStillExecution(makeCtx({
      currentTurn: makeTurn({ toolBlock: { action: 'datatable.create', id: 'r3', params: {} } }),
      result: okResult(),
    }))
    expect(followUp).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════
// Terminal Actions Monitor
// ═══════════════════════════════════════════════════════════

describe('terminal-actions-monitor', () => {
  function sessionWithBlueprint(allDone: boolean): IStillSession {
    const blueprintState = session.domains['blueprint']
    if (!blueprintState) {
      throw new Error('blueprint domain state is missing in test session')
    }

    const nextBlueprintState = { ...blueprintState } as typeof blueprintState & { data: unknown }
    nextBlueprintState.data = {
      version: 1,
      userGoal: 'test',
      currentCheckpointId: 'cp1',
      currentPlanItemId: 'pi1',
      openQuestions: [],
      checkpoints: [
        {
          id: 'cp1',
          title: 'Setup',
          plannedActions: ['dataset.bootstrap'],
          planItems: [],
          validation: 'ok',
          status: allDone ? 'done' : 'pending',
        },
      ],
    }

    return {
      ...session,
      domains: {
        ...session.domains,
        blueprint: nextBlueprintState,
      },
    }
  }

  it('does not nudge when no blueprint exists', () => {
    const monitor = createTerminalActionsMonitor()
    const blueprintState = session.domains['blueprint']
    if (!blueprintState) {
      throw new Error('blueprint domain state is missing in test session')
    }
    const nextBlueprintState = { ...blueprintState } as typeof blueprintState & { data: unknown }
    nextBlueprintState.data = null
    const ctx = makeCtx({
      session: {
        ...session,
        domains: {
          ...session.domains,
          blueprint: nextBlueprintState,
        },
      },
    })
    expect(monitor.afterStillExecution(ctx)).toEqual([])
  })

  it('does not nudge when blueprint has pending checkpoints', () => {
    const monitor = createTerminalActionsMonitor()
    const ctx = makeCtx({ session: sessionWithBlueprint(false) })
    expect(monitor.afterStillExecution(ctx)).toEqual([])
  })

  it('nudges when blueprint is all done but no terminal action seen', () => {
    const monitor = createTerminalActionsMonitor()
    const ctx = makeCtx({ session: sessionWithBlueprint(true) })
    const followUp = monitor.afterStillExecution(ctx)
    expect(followUp.length).toBe(1)
    expect(followUp[0]).toContain('终局提醒')
    expect(followUp[0]).toContain('dataset.validate')
    expect(followUp[0]).toContain('dataset.export')
  })

  it('stops nudging after terminal action succeeds', () => {
    const monitor = createTerminalActionsMonitor()
    const doneSession = sessionWithBlueprint(true)

    // First call: nudge
    const ctx1 = makeCtx({ session: doneSession })
    expect(monitor.afterStillExecution(ctx1).length).toBe(1)

    // Terminal action
    const termCtx = makeCtx({
      session: doneSession,
      currentTurn: makeTurn({ toolBlock: { action: 'dataset.validate', id: 'rv', params: {} } }),
      result: okResult(),
    })
    monitor.afterStillExecution(termCtx)

    // Subsequent calls: no nudge
    const ctx2 = makeCtx({ session: doneSession })
    expect(monitor.afterStillExecution(ctx2)).toEqual([])
  })

  it('limits nudges to 2', () => {
    const monitor = createTerminalActionsMonitor()
    const doneSession = sessionWithBlueprint(true)

    // First 2 nudges
    for (let i = 0; i < 2; i++) {
      const ctx = makeCtx({ session: doneSession })
      expect(monitor.afterStillExecution(ctx).length).toBe(1)
    }

    // 3rd nudge suppressed
    const ctx3 = makeCtx({ session: doneSession })
    expect(monitor.afterStillExecution(ctx3)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════
// formatWarningsAsFollowUp
// ═══════════════════════════════════════════════════════════

describe('formatWarningsAsFollowUp', () => {
  it('formats warnings with fix suggestions', () => {
    const warnings: PostValidationWarning[] = [
      { rule: 'orphan-column', detail: 'Column X has no table', fix: 'Add table first' },
      { rule: 'missing-pk', detail: 'Table Y has no PK' },
    ]
    const text = formatWarningsAsFollowUp('datatable.addColumns', warnings)
    expect(text).toContain('orphan-column')
    expect(text).toContain('Add table first')
    expect(text).toContain('missing-pk')
    expect(text).toContain('datatable.addColumns')
  })
})

// ═══════════════════════════════════════════════════════════
// Orchestrator Loop (mock backend)
// ═══════════════════════════════════════════════════════════

describe('runStillsLoop', () => {
  /** 构造 FC ToolCall */
  function makeToolCall(action: string, id: string, params: Record<string, unknown> = {}): ToolCall {
    return {
      id,
      function: {
        name: actionToFunctionName(action),
        arguments: JSON.stringify(params),
      },
    }
  }

  function createMockBackend(replies: Array<{ text?: string; reasoning?: string; toolCalls?: ToolCall[] } | null>): SessionBackend {
    let callIndex = 0
    const messages: Array<{ role: string; content: string }> = []

    return {
      async createSession() { return 'mock-session-id' },
      async executeTurn() {
        if (callIndex >= replies.length) return null
        const reply = replies[callIndex++]
        if (!reply) return null
        const response: LlmResponse = { text: reply.text ?? '' }
        if (reply.reasoning !== undefined) response.reasoning = reply.reasoning
        if (reply.toolCalls !== undefined) response.toolCalls = reply.toolCalls
        return response
      },
      async appendMessages(_sid, msgs) {
        messages.push(...msgs)
      },
      async getConversation() { return messages },
      async destroySession() { /* noop */ },
      async destroyAllSessions() { /* noop */ },
    }
  }

  it('returns immediately on LLM failure', async () => {
    const backend = createMockBackend([null])
    const result = await runStillsLoop('test', session, backend, {
      maxRounds: 10,
      slidingWindow: 20,
      systemPrompt: 'test',
      followUpPolicy: createDefaultFollowUpPolicy(),
    })

    expect(result.aborted).toBe(true)
    expect(result.rounds).toBe(1)
    expect(result.abortReason).toContain('LLM')
  })

  it('runs a single-turn session.describe', async () => {
    // Init session so stills can run
    exec('dataset.bootstrap', { dataSetName: 'DS' })

    const backend = createMockBackend([
      { toolCalls: [makeToolCall('session.describe', 'r1')] },
      null, // end loop
    ])

    const result = await runStillsLoop('test', session, backend, {
      maxRounds: 10,
      slidingWindow: 20,
      systemPrompt: 'test',
      followUpPolicy: createDefaultFollowUpPolicy(),
    })

    expect(result.rounds).toBe(2)
    expect(result.turns.length).toBeGreaterThanOrEqual(1)
    // First turn should have stills-execute phase
    const stillsTurn = result.turns.find(t => t.phase === 'stills-execute')
    expect(stillsTurn).toBeDefined()
    expect(stillsTurn?.stillsResult?.ok).toBe(true)
  })

  it('stops at maxRounds', async () => {
    // Infinite loop: LLM always returns session.describe
    const infiniteReplies = Array.from({ length: 5 }, (_, i) => ({
      toolCalls: [makeToolCall('session.describe', `r${i}`)],
    }))

    // Init session
    exec('dataset.bootstrap', { dataSetName: 'DS' })

    const backend = createMockBackend(infiniteReplies)
    const result = await runStillsLoop('test', session, backend, {
      maxRounds: 3,
      slidingWindow: 20,
      systemPrompt: 'test',
      followUpPolicy: createDefaultFollowUpPolicy(),
    })

    expect(result.rounds).toBe(3)
    expect(result.aborted).toBe(false)
  })

  it('aborts when monitor triggers abort', async () => {
    exec('dataset.bootstrap', { dataSetName: 'DS' })

    // Same action repeated → repeat detection fires
    const replies = Array.from({ length: 5 }, (_, i) => ({
      toolCalls: [makeToolCall('session.describe', `r${i}`)],
    }))

    const backend = createMockBackend(replies)
    const monitor = createRepeatDetectionMonitor({ maxSameSignature: 2 })

    const result = await runStillsLoop('test', session, backend, {
      maxRounds: 10,
      slidingWindow: 20,
      systemPrompt: 'test',
      followUpPolicy: createDefaultFollowUpPolicy(),
      monitors: [monitor],
    })

    expect(result.aborted).toBe(true)
    expect(result.abortReason).toContain('session.describe')
    expect(result.rounds).toBe(2) // aborts on 2nd same action
  })

  it('returns pure text turn when AI has no tool calls', async () => {
    const backend = createMockBackend([
      { text: '我来想想怎么做…' }, // no toolCalls → pure text, FC terminates
    ])

    const result = await runStillsLoop('test', session, backend, {
      maxRounds: 5,
      slidingWindow: 20,
      systemPrompt: 'test',
      followUpPolicy: createDefaultFollowUpPolicy(),
    })

    // FC mode: pure text = conversation end (no reminder needed)
    expect(result.turns[0]?.phase).toBe('ai-response')
    expect(result.rounds).toBe(1)
  })

  it('forwards signal and per-run SSE handler to the backend', async () => {
    const controller = new AbortController()
    const sseSpy: Array<{ sessionId: string; type: string; data: string }> = []

    exec('dataset.bootstrap', { dataSetName: 'DS' })

    const backend: SessionBackend = {
      async createSession(_systemPrompt, _userPrompt, _windowSize, _tools, signal) {
        expect(signal).toBe(controller.signal)
        return 'mock-session-id'
      },
      async executeTurn(_sessionId, options) {
        expect(options?.signal).toBe(controller.signal)
        options?.onSseEvent?.({
          sessionId: 'mock-session-id',
          type: 'delta',
          data: 'stream-fragment',
        })
        return { text: 'done' }
      },
      async appendMessages(_sid, _msgs, signal) {
        expect(signal).toBe(controller.signal)
      },
      async getConversation() { return [] },
      async destroySession() { /* noop */ },
      async destroyAllSessions() { /* noop */ },
    }

    const result = await runStillsLoop('test', session, backend, {
      maxRounds: 5,
      slidingWindow: 20,
      systemPrompt: 'test',
      followUpPolicy: createDefaultFollowUpPolicy(),
      signal: controller.signal,
      onSseEvent(event) {
        sseSpy.push(event)
      },
    })

    expect(result.rounds).toBe(1)
    expect(sseSpy).toEqual([
      {
        sessionId: 'mock-session-id',
        type: 'delta',
        data: 'stream-fragment',
      },
    ])
  })

  it('injects escalated followUp after repeated same failed signature', async () => {
    type MockReply = {
      text?: string
      reasoning?: string
      toolCalls?: ToolCall[]
    }

    const replies: MockReply[] = [
      { toolCalls: [makeToolCall('sparkNodeTree.addNode', 'r1', { parentComponentId: 'root-table', index: 0 })] },
      { toolCalls: [makeToolCall('sparkNodeTree.addNode', 'r2', { parentComponentId: 'root-table', index: 0 })] },
      { text: 'done' },
    ]

    let callIndex = 0
    const appended: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: ToolCall[] }> = []

    const backend: SessionBackend = {
      async createSession() { return 'mock-session-id' },
      async executeTurn() {
        const reply = replies[callIndex]
        if (reply === undefined) return null
        callIndex++
        const response: LlmResponse = { text: reply.text ?? '' }
        if (reply.reasoning !== undefined) response.reasoning = reply.reasoning
        if (reply.toolCalls !== undefined) response.toolCalls = reply.toolCalls
        return response
      },
      async appendMessages(_sid, msgs) {
        appended.push(...msgs)
      },
      async getConversation() {
        return appended.map(m => ({ role: m.role, content: m.content }))
      },
      async destroySession() { /* noop */ },
      async destroyAllSessions() { /* noop */ },
    }

    const mockDispatchFc = (tc: ToolCall): FcDispatchResult => {
      const result: StillResult = {
        ok: false,
        code: 'EXECUTE_ERROR',
        msg: 'addNode.node must be a SparkNode with a non-empty type',
        fix: '正确参数格式: {"node":{"type":"r-text"}}',
      }
      return {
        action: 'sparkNodeTree.addNode',
        result,
        toolCall: tc,
        toolResult: {
          tool_call_id: tc.id,
          content: JSON.stringify({ ok: false, code: result.code, msg: result.msg, fix: result.fix }),
        },
      }
    }

    const result = await runStillsLoop('test', session, backend, {
      maxRounds: 5,
      slidingWindow: 20,
      systemPrompt: 'test',
      followUpPolicy: createDefaultFollowUpPolicy(),
      dispatchFc: mockDispatchFc,
    })

    expect(result.rounds).toBe(3)
    const toolMessages = appended.filter(m => m.role === 'tool')
    expect(toolMessages.length).toBe(2)

    const firstPayload = JSON.parse(toolMessages[0]?.content ?? '{}') as { _followUp?: string[] }
    const secondPayload = JSON.parse(toolMessages[1]?.content ?? '{}') as { _followUp?: string[] }
    const firstFollowUp = firstPayload._followUp ?? []
    const secondFollowUp = secondPayload._followUp ?? []

    expect(firstFollowUp.join('\n')).toContain('系统即时纠错')
    expect(firstFollowUp.join('\n')).toContain('错误详情')
    expect(firstFollowUp.join('\n')).toContain('对应动作 actionSpec（已内联，无需再次查询）')
    expect(firstFollowUp.join('\n')).not.toContain('系统升级纠错')
    expect(secondFollowUp.join('\n')).toContain('系统即时纠错')
    expect(secondFollowUp.join('\n')).toContain('系统升级纠错')
    expect(secondFollowUp.join('\n')).toContain('对应动作 actionSpec（已内联，无需再次查询）')
    expect(secondFollowUp.join('\n')).not.toContain('下一步必须先调用 stills.actionSpec')
    expect(secondFollowUp.join('\n')).toContain('sparkNodeTree.addNode')
  })

  it('terminates on export + blueprint done', async () => {
    // Prepare session with blueprint all-done
    exec('dataset.bootstrap', { dataSetName: 'DS' })
    exec('blueprint.create', {
      userGoal: 'test',
      checkpoints: [
        {
          id: 'cp1',
          title: 'Build',
          plannedActions: ['dataset.export'],
          planItems: [{ id: 'pi1', title: 'Export', action: 'dataset.export' }],
          validation: 'check export',
        },
      ],
    })
    exec('blueprint.item.advance', { checkpointId: 'cp1', planItemId: 'pi1', status: 'done', note: 'ok' })
    exec('blueprint.advance', { checkpointId: 'cp1', status: 'done', note: 'ok' })

    // Mock dispatchFc that returns ok for dataset.export (bypass guard)
    const mockDispatchFc = (tc: ToolCall, s: IStillSession): FcDispatchResult => {
      if (tc.function.name === actionToFunctionName('dataset.export')) {
        const result: StillResult = { ok: true, data: { exported: true }, summary: 'exported' }
        return { action: 'dataset.export', result, toolCall: tc, toolResult: { tool_call_id: tc.id, content: JSON.stringify({ ok: true }) } }
      }
      return dispatchToolCall(tc, s)
    }

    const backend = createMockBackend([
      { toolCalls: [makeToolCall('dataset.export', 'r-export')] },
      { toolCalls: [makeToolCall('session.describe', 'r-extra')] }, // should NOT execute
    ])

    const result = await runStillsLoop('test', session, backend, {
      maxRounds: 10,
      slidingWindow: 20,
      systemPrompt: 'test',
      followUpPolicy: createDefaultFollowUpPolicy(),
      dispatchFc: mockDispatchFc,
      monitors: [createExportCompletionMonitor()],
    })

    expect(result.completed).toBe(true)
    expect(result.rounds).toBe(1) // terminated after export
    expect(result.aborted).toBe(false)
  })
})
