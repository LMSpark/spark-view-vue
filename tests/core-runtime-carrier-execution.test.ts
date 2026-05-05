import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  actionToFunctionName,
  clearFunctionCarrierRegistry,
  clearFunctionRegistry,
  clearKnowledgeRegistry,
  createFunctionRuntimeContext,
  executeFunction,
  executeFunctionAsync,
  functionToToolDefinition,
  knowledgeQueryTools,
  registerFunction,
  registerFunctionCarrier,
  runFunctionLoop,
  type FunctionCarrierContract,
  type RegisteredFunctionDefinition,
  type SessionBackend,
  type ToolCall,
} from '@spark-view/spark-ai'

function createCarrierDefinition(): RegisteredFunctionDefinition<{ value?: number }, { accepted: boolean }> {
  return {
    action: 'pageDesign@carrierTest@run',
    type: 'request',
    description: 'carrier runtime test action',
    modulePrompt: 'legacy prompt should be overridden',
    paramsSchema: { value: 'number?' },
    resultSchema: { accepted: 'boolean' },
    example: { value: 1 },
    usageRules: ['value 为可选数字'],
    failureModes: [],
    validate: (params) => {
      if (typeof params !== 'object' || params === null) return '参数必须是对象'
      return null
    },
    execute: () => ({
      ok: false,
      code: 'MISSING_CARRIER',
      msg: 'should not reach legacy execute',
      fix: 'register carrier first',
    }),
    executeWithCarrier: (_context, carrier, params) => {
      const runtime = carrier as { calls: unknown[] }
      runtime.calls.push(params)
      return {
        ok: true,
        data: { accepted: true },
        summary: 'carrier execute complete',
      }
    },
  }
}

function createBackendWithToolCall(toolCall: ToolCall): SessionBackend {
  let turn = 0

  return {
    createSession: vi.fn(async () => 'session-1'),
    executeTurn: vi.fn(async () => {
      turn += 1
      if (turn === 1) {
        return {
          text: 'call tool',
          toolCalls: [toolCall],
        }
      }
      return {
        text: 'done',
        toolCalls: [],
      }
    }),
    appendMessages: vi.fn(async () => {}),
    getConversation: vi.fn(async () => []),
    destroySession: vi.fn(async () => {}),
    destroyAllSessions: vi.fn(async () => {}),
  }
}

beforeEach(() => {
  clearFunctionCarrierRegistry()
  clearFunctionRegistry()
  clearKnowledgeRegistry()
})

describe('core runtime carrier execution', () => {
  it('keeps sync executeFunction backward compatible while using executeWithCarrier', () => {
    const runtime = { calls: [] as unknown[] }
    registerFunction(createCarrierDefinition() as unknown as RegisteredFunctionDefinition<unknown, unknown>)
    registerFunctionCarrier({
      carrierKey: 'pageDesign@carrierTest',
      prompt: 'carrier prompt',
      isPrimary: true,
      instance: runtime,
    })

    const context = createFunctionRuntimeContext()
    const result = executeFunction('pageDesign@carrierTest@run', { value: 2 }, context, 'sync-1')

    expect(result.ok).toBe(true)
    expect(runtime.calls).toEqual([{ value: 2 }])
    expect(context.patchLog).toHaveLength(1)
  })

  it('supports async before/after carrier hooks and patch logging', async () => {
    const runtime = { calls: [] as unknown[] }
    const beforeExecute = vi.fn(async () => ({ cancelled: false as const }))
    const afterExecute = vi.fn(async () => {})

    registerFunction(createCarrierDefinition() as unknown as RegisteredFunctionDefinition<unknown, unknown>)
    registerFunctionCarrier({
      carrierKey: 'pageDesign@carrierTest',
      prompt: 'carrier prompt',
      description: 'carrier runtime',
      isPrimary: true,
      instance: runtime,
      beforeExecute,
      afterExecute,
    })

    const context = createFunctionRuntimeContext()
    const result = await executeFunctionAsync('pageDesign@carrierTest@run', { value: 3 }, context, 'async-1')

    expect(result.ok).toBe(true)
    expect(runtime.calls).toEqual([{ value: 3 }])
    expect(beforeExecute).toHaveBeenCalledTimes(1)
    expect(afterExecute).toHaveBeenCalledTimes(1)
    expect(context.patchLog).toHaveLength(1)
  })

  it('supports beforeExecute cancellation without calling executeWithCarrier', async () => {
    const runtime = { calls: [] as unknown[] }
    const beforeExecute = vi.fn(async () => ({
      cancelled: true as const,
      code: 'BLOCKED_BY_CARRIER',
      msg: 'carrier blocked execution',
      fix: 'retry later',
    }))

    registerFunction(createCarrierDefinition() as unknown as RegisteredFunctionDefinition<unknown, unknown>)
    registerFunctionCarrier({
      carrierKey: 'pageDesign@carrierTest',
      prompt: 'carrier prompt',
      instance: runtime,
      beforeExecute,
    })

    const context = createFunctionRuntimeContext()
    const result = await executeFunctionAsync('pageDesign@carrierTest@run', { value: 4 }, context, 'async-2')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('BLOCKED_BY_CARRIER')
    expect(result.msg).toBe('carrier blocked execution')
    expect(runtime.calls).toEqual([])
    expect(context.patchLog).toHaveLength(0)
  })

  it('fails fast when a carrier-aware definition has no registered carrier', () => {
    registerFunction(createCarrierDefinition() as unknown as RegisteredFunctionDefinition<unknown, unknown>)

    const result = executeFunction('pageDesign@carrierTest@run', { value: 5 }, createFunctionRuntimeContext(), 'sync-2')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('MISSING_CARRIER')
    expect(result.fix).toContain('pageDesign@carrierTest')
  })

  it('projects module prompt from carrier prompt instead of legacy definition prompt', () => {
    registerFunction(createCarrierDefinition() as unknown as RegisteredFunctionDefinition<unknown, unknown>)
    registerFunctionCarrier({
      carrierKey: 'pageDesign@carrierTest',
      prompt: 'carrier prompt wins',
      description: 'carrier runtime',
      isPrimary: true,
      instance: { calls: [] },
    } as FunctionCarrierContract<unknown>)

    const toolDefinition = functionToToolDefinition(createCarrierDefinition())
    expect(toolDefinition.function.description).toContain('模块提示: carrier prompt wins')
    expect(toolDefinition.function.description).not.toContain('legacy prompt should be overridden')

    const knowledge = knowledgeQueryTools.execute(createFunctionRuntimeContext(), {})
    expect(knowledge.ok).toBe(true)
    if (!knowledge.ok) return
    const modules = (knowledge.data as { modules: Array<{ module: string; prompt: string; isPrimary?: boolean }> }).modules
    const carrierModule = modules.find(module => module.module === 'carrierTest')
    expect(carrierModule?.prompt).toBe('carrier prompt wins')
    expect(carrierModule?.isPrimary).toBe(true)
  })

  it('runs carrier before/after hooks through runFunctionLoop default async dispatch', async () => {
    const runtime = { calls: [] as unknown[] }
    const beforeExecute = vi.fn(async () => ({ cancelled: false as const }))
    const afterExecute = vi.fn(async () => {})

    registerFunction(createCarrierDefinition() as unknown as RegisteredFunctionDefinition<unknown, unknown>)
    registerFunctionCarrier({
      carrierKey: 'pageDesign@carrierTest',
      prompt: 'carrier prompt',
      instance: runtime,
      beforeExecute,
      afterExecute,
    })

    const backend = createBackendWithToolCall({
      id: 'tool-1',
      function: {
        name: actionToFunctionName('pageDesign@carrierTest@run'),
        arguments: JSON.stringify({ value: 6 }),
      },
    })

    const context = createFunctionRuntimeContext()
    const result = await runFunctionLoop('run carrier tool', context, backend, {
      maxRounds: 2,
      slidingWindow: 8,
      systemPrompt: 'system',
      followUpPolicy: {
        buildFollowUps: () => [],
      },
    })

    expect(beforeExecute).toHaveBeenCalledTimes(1)
    expect(afterExecute).toHaveBeenCalledTimes(1)
    expect(runtime.calls).toEqual([{ value: 6 }])
    expect(result.turns.some(turn => turn.phase === 'function-execute')).toBe(true)
    expect(context.patchLog).toHaveLength(1)
  })
})