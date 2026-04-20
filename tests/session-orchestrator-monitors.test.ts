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
} from '../packages/spark-ai/src/stills'
import type { IStillSession, StillResult, PostValidationWarning } from '../packages/spark-ai/src/stills'
import {
  createRepeatDetectionMonitor,
} from '../packages/spark-ai/src/runtime/monitors/repeat-detection-monitor'
import {
  createBlueprintOrchestrationMonitor,
} from '../packages/spark-ai/src/runtime/monitors/blueprint-orchestration-monitor'
import {
  createTerminalActionsMonitor,
} from '../packages/spark-ai/src/runtime/monitors/terminal-actions-monitor'
import type {
  MonitorContext,
  DialogueTurn,
  SessionBackend,
  LlmResponse,
} from '../packages/spark-ai/src/runtime/session-orchestrator'
import {
  runStillsLoop,
  formatWarningsAsFollowUp,
} from '../packages/spark-ai/src/runtime/session-orchestrator'
import { actionToFunctionName, dispatchToolCall } from '../packages/spark-ai/src/tool-calling'
import type { ToolCall, FcDispatchResult } from '../packages/spark-ai/src/tool-calling'

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
    })

    // FC mode: pure text = conversation end (no reminder needed)
    expect(result.turns[0]?.phase).toBe('ai-response')
    expect(result.rounds).toBe(1)
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
      dispatchFc: mockDispatchFc,
    })

    expect(result.exportCompleted).toBe(true)
    expect(result.rounds).toBe(1) // terminated after export
    expect(result.aborted).toBe(false)
  })
})
