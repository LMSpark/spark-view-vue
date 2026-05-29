import { describe, expect, it, vi } from 'vitest'

import {
  AiAgentScope,
  DefaultAiAgentSessionStore,
  createAiBusinessKit,
  createAiAgentHost,
  createAiAgentRegistration,
  createAiAgentSessionTranscript,
  createSimpleInputContract,
  summarizeAiAgentSessionRecord,
  type AiAgentRegistrationOptions,
  type AiAgentTaskChatOptions,
  type AiAgentTurnCallbacks,
} from '../agent'
import {
  AiModule,
  AiModuleResult,
  AiModuleRuntime,
  type AiModuleInstanceRef,
} from '../modules'
import {
  noParamsSchema,
  paramsSchema,
  stringSchema,
  type AiJsonParams,
} from '../json'

type TaskInput = AiJsonParams & Readonly<{ id: string; message: string }>
type TaskRegistrationHooks = Readonly<{
  beforeFunctionCall?: NonNullable<AiAgentRegistrationOptions<TaskInput>['beforeFunctionCall']>
  afterFunctionCall?: NonNullable<AiAgentRegistrationOptions<TaskInput>['afterFunctionCall']>
  onEndBusinessInstance?: NonNullable<AiAgentRegistrationOptions<TaskInput>['onEndBusinessInstance']>
}>
type TaskRequestBeforeFunctionCall = NonNullable<AiAgentTaskChatOptions['beforeFunctionCall']>

function createRuntime(): AiModuleRuntime {
  const runtime = new AiModuleRuntime()
  runtime.register(new AiModule({
    kind: 'task',
    name: '任务',
    description: '测试任务模块',
    functions: [
      {
        name: 'complete',
        description: '完成任务',
        paramsSchema: noParamsSchema(),
      },
      {
        name: 'fail',
        description: '返回失败结果',
        paramsSchema: noParamsSchema(),
      },
    ],
    runner: (_ctx, functionName) => {
      if (functionName === 'complete') return AiModuleResult.ok({ done: true })
      return AiModuleResult.failCode('INTENTIONAL_FAILURE', '工具失败', '读取 diagnostics 后修正参数或业务状态。')
    },
    find: (_ctx, childKind, query) => {
      if (childKind !== 'task') return AiModuleResult.ok<readonly AiModuleInstanceRef[]>([])
      const id = typeof query['id'] === 'string' ? query['id'] : 'task-1'
      return AiModuleResult.ok<readonly AiModuleInstanceRef[]>([{ id, label: `任务 ${id}` }])
    },
  }))
  return runtime
}

function createRegistration(
  store = new DefaultAiAgentSessionStore(),
  hooks: TaskRegistrationHooks = {},
) {
  return createAiAgentRegistration<TaskInput>({
    kindID: 'task',
    name: '任务助手',
    description: '测试任务助手',
    runtime: createRuntime(),
    sessionStore: store,
    ...(hooks.beforeFunctionCall === undefined ? {} : { beforeFunctionCall: hooks.beforeFunctionCall }),
    ...(hooks.afterFunctionCall === undefined ? {} : { afterFunctionCall: hooks.afterFunctionCall }),
    ...(hooks.onEndBusinessInstance === undefined ? {} : { onEndBusinessInstance: hooks.onEndBusinessInstance }),
    inputContract: {
      paramsSchema: paramsSchema({
        id: stringSchema('任务 ID'),
        message: stringSchema('用户消息'),
      }, ['id', 'message']),
      identityField: 'id',
      normalize: (input) => ({
        id: String(input['id']),
        message: String(input['message']),
      }),
      toScope: (input) => new AiAgentScope('task', input.id, input.id, input.id),
      toOrchestration: (input) => ({
        userMessage: input.message,
        systemPrompt: '按固定 module_* 工具协议完成任务。',
      }),
    },
  })
}

function createCallbacks(): {
  callbacks: AiAgentTurnCallbacks
  rounds: string[][]
  prompts: string[]
  turnIds: string[]
} {
  const rounds: string[][] = []
  const prompts: string[] = []
  const turnIds: string[] = []
  const callbacks: AiAgentTurnCallbacks = {
    prepareSession: async (input) => {
      prompts.push(input.systemPrompt)
      rounds.push(input.tools.map((tool) => tool.function.name))
    },
    executeTurn: async (input) => {
      prompts.push(input.systemPrompt)
      rounds.push(input.tools.map((tool) => tool.function.name))
      turnIds.push(input.turn.turnId)
      if (input.messages.length > 0) {
        return {
          text: '',
          toolCalls: [{
            id: 'call-1',
            type: 'function',
            function: {
              name: 'module_call',
              arguments: JSON.stringify({
                path: '/task[task-a]',
                functionName: 'fail',
                args: {},
              }),
            },
          }],
        }
      }
      return { text: '已记录失败并等待修正', toolCalls: [] }
    },
    appendMessages: async () => {},
  }
  return { callbacks, rounds, prompts, turnIds }
}

describe('AiAgentHost public API', () => {
  it('registers, ensures and runs by alias without dynamic run map', async () => {
    const { callbacks, rounds, prompts } = createCallbacks()
    const host = createAiAgentHost({ turnCallbacks: callbacks, maxToolRounds: 2 })
      .register('taskAssistant', createRegistration())

    expect(host.has('taskAssistant')).toBe(true)
    await host.run('taskAssistant', { id: 'task-a', message: '执行任务' })

    expect(rounds[0]).toEqual([
      'module_query',
      'module_guide',
      'module_attribute_guide',
      'module_function_guide',
      'module_find',
      'module_attr',
      'module_call',
      'human_question',
    ])
    expect(prompts[0]).toContain('module_attribute_guide')
    expect(Reflect.get(host, 'taskAssistant')).toBeUndefined()
  })

  it('uses a unique transport turn id for each LLM tool-loop round', async () => {
    const { callbacks, turnIds } = createCallbacks()
    const host = createAiAgentHost({ turnCallbacks: callbacks, maxToolRounds: 2 })
      .register('taskAssistant', createRegistration())

    await host.run('taskAssistant', { id: 'task-a', message: '执行任务' }, {
      turn: {
        turnId: 'turn-main',
        seq: 1,
        baseRevision: 0,
        queuedAt: '2026-05-30T00:00:00.000Z',
        startedAt: '2026-05-30T00:00:00.000Z',
        maxParallelTurns: 1,
      },
    })

    expect(turnIds).toEqual(['turn-main', 'turn-main-llm-round-2'])
  })

  it('requires explicit sessionStore during registration', () => {
    const registration = createRegistration()
    const registrationWithoutStore = {
      ...registration,
      sessionStore: undefined,
    }
    const host = createAiAgentHost({ turnCallbacks: createCallbacks().callbacks })

    expect(() => Reflect.apply(host.register, host, ['broken', registrationWithoutStore])).toThrow(
      'requires explicit sessionStore',
    )
  })

  it('ensure reuses the same alias when moduleId matches', () => {
    const host = createAiAgentHost({ turnCallbacks: createCallbacks().callbacks })
    const ensured = host.ensure('taskAssistant', {
      moduleId: 'task',
      create: () => createRegistration(),
    })
    const ensuredAgain = ensured.ensure('taskAssistant', {
      moduleId: 'task',
      create: () => {
        throw new Error('should not recreate')
      },
    })

    expect(ensuredAgain.has('taskAssistant')).toBe(true)
  })

  it('creates business kit registrations and dry-runs without calling LLM', () => {
    type TicketInput = AiJsonParams & Readonly<{ ticketId: string; message: string }>
    const kit = createAiBusinessKit<TicketInput>({
      businessId: 'ticket',
      name: '工单助手',
      description: '处理工单。',
      rootModule: new AiModule({
        kind: 'ticket',
        name: '工单',
        description: '工单根模块',
        find: (_ctx, childKind, query) => {
          if (childKind !== 'ticket') return AiModuleResult.ok<readonly AiModuleInstanceRef[]>([])
          const id = typeof query['id'] === 'string' ? query['id'] : 'T-1001'
          return AiModuleResult.ok<readonly AiModuleInstanceRef[]>([{ id, label: `工单 ${id}` }])
        },
      }),
      input: {
        paramsSchema: paramsSchema({
          ticketId: stringSchema('工单 ID'),
          message: stringSchema('用户消息'),
        }, ['ticketId', 'message']),
        identityField: 'ticketId',
        messageField: 'message',
        systemPrompt: (input) => `当前工单：${input.ticketId}。按固定 module_* 工具协议处理。`,
      },
    })
    const host = createAiAgentHost({ turnCallbacks: createCallbacks().callbacks })
      .register('ticketAssistant', kit.registration)

    expect(kit.inspectReport).toMatchObject({ ok: true, rootKinds: ['ticket'] })
    expect(host.listRegistrations()).toEqual([
      expect.objectContaining({
        alias: 'ticketAssistant',
        moduleId: 'ticket',
        rootKinds: ['ticket'],
        status: 'ok',
      }),
    ])
    expect(host.describe('ticketAssistant')).toMatchObject({
      moduleId: 'ticket',
      inspectReport: expect.objectContaining({ ok: true }),
    })
    expect(host.dryRun('ticketAssistant', {
      ticketId: 'T-1001',
      message: '查看状态',
    })).toMatchObject({
      ok: true,
      moduleId: 'ticket',
      scope: expect.objectContaining({ businessRegistrationId: 'ticket', businessInstanceId: 'T-1001' }),
      orchestration: expect.objectContaining({
        userMessage: '查看状态',
        systemPrompt: expect.stringContaining('T-1001'),
      }),
      orchestrationSummary: expect.objectContaining({
        userMessageLength: 4,
        readonlyStepCount: 0,
      }),
      tools: expect.arrayContaining(['module_query', 'module_call']),
      diagnostics: [expect.objectContaining({ code: 'RUNTIME_INSPECT_OK' })],
    })
    expect(host.unregister('ticketAssistant').has('ticketAssistant')).toBe(false)
  })

  it('keeps simple input contracts available for low-level registrations', () => {
    type TicketInput = AiJsonParams & Readonly<{ ticketId: string; message: string }>
    const inputContract = createSimpleInputContract<TicketInput>({
      businessId: 'ticket',
      paramsSchema: paramsSchema({
        ticketId: stringSchema('工单 ID'),
        message: stringSchema('用户消息'),
      }, ['ticketId', 'message']),
      identityField: 'ticketId',
      messageField: 'message',
      systemPrompt: (input) => `当前工单：${input.ticketId}`,
    })

    const orchestration = inputContract.toOrchestration({
      ticketId: 'T-1001',
      message: '查看状态',
    })

    expect(inputContract.identityField).toBe('ticketId')
    expect(orchestration).toMatchObject({
      userMessage: '查看状态',
      systemPrompt: '当前工单：T-1001',
    })
  })

  it('rejects a tool call in beforeFunctionCall without executing runtime or after hook', async () => {
    const store = new DefaultAiAgentSessionStore()
    const beforeFunctionCall = vi.fn<NonNullable<AiAgentRegistrationOptions<TaskInput>['beforeFunctionCall']>>(() => ({
      status: 'reject',
      reason: '需要人工审批',
      fix: '等待用户批准后再执行。',
    }))
    const afterFunctionCall = vi.fn<NonNullable<AiAgentRegistrationOptions<TaskInput>['afterFunctionCall']>>(() => ({
      status: 'continue',
    }))
    const host = createAiAgentHost({ turnCallbacks: createCallbacks().callbacks, maxToolRounds: 2 })
      .register('task', createRegistration(store, { beforeFunctionCall, afterFunctionCall }))

    await host.run('task', { id: 'task-a', message: '执行任务' })

    expect(beforeFunctionCall).toHaveBeenCalledWith(expect.objectContaining({
      moduleId: 'task',
      moduleInstanceId: 'task-a',
      instanceId: 'task-a',
      toolName: 'module_call',
      args: expect.objectContaining({
        functionName: 'fail',
      }),
    }))
    expect(afterFunctionCall).not.toHaveBeenCalled()

    const functionCall = store.listSessions()[0]?.history.find((entry) => entry.kind === 'functionCall')
    expect(functionCall).toMatchObject({
      kind: 'functionCall',
      status: 'failed',
      error: {
        code: 'AI_TOOL_REJECTED_BEFORE_EXECUTION',
        msg: '需要人工审批',
        fix: '等待用户批准后再执行。',
      },
      metadata: {
        blockedBy: 'beforeFunctionCall',
        decision: 'reject',
      },
    })
  })

  it('accepts request-scoped beforeFunctionCall without changing the business registration', async () => {
    const store = new DefaultAiAgentSessionStore()
    const beforeFunctionCall = vi.fn<TaskRequestBeforeFunctionCall>(() => ({
      status: 'reject',
      reason: '本轮运行需要 UI 审批',
      fix: '等待用户批准后再执行。',
    }))
    const host = createAiAgentHost({ turnCallbacks: createCallbacks().callbacks, maxToolRounds: 1 })
      .register('task', createRegistration(store))

    await host.run('task', { id: 'task-a', message: '第一轮' }, { beforeFunctionCall })
    await host.run('task', { id: 'task-a', message: '第二轮' })

    const functionCalls = store.listSessions()[0]?.history.filter((entry) => entry.kind === 'functionCall')
    expect(beforeFunctionCall).toHaveBeenCalledTimes(1)
    expect(functionCalls).toEqual([
      expect.objectContaining({
        kind: 'functionCall',
        status: 'failed',
        error: expect.objectContaining({
          code: 'AI_TOOL_REJECTED_BEFORE_EXECUTION',
          msg: '本轮运行需要 UI 审批',
        }),
      }),
      expect.objectContaining({
        kind: 'functionCall',
        status: 'failed',
        error: expect.objectContaining({
          code: 'INTENTIONAL_FAILURE',
          msg: '工具失败',
        }),
      }),
    ])
  })

  it('aborts the session when beforeFunctionCall returns abort', async () => {
    const store = new DefaultAiAgentSessionStore()
    const onEndBusinessInstance = vi.fn<NonNullable<AiAgentRegistrationOptions<TaskInput>['onEndBusinessInstance']>>()
    const beforeFunctionCall = vi.fn<NonNullable<AiAgentRegistrationOptions<TaskInput>['beforeFunctionCall']>>(() => ({
      status: 'abort',
      reason: '用户取消工具执行',
      finalAssistantMessage: '已停止本次操作。',
    }))
    const host = createAiAgentHost({ turnCallbacks: createCallbacks().callbacks, maxToolRounds: 2 })
      .register('task', createRegistration(store, { beforeFunctionCall, onEndBusinessInstance }))

    await host.run('task', { id: 'task-a', message: '执行任务' })

    const record = host.listSessions('task')[0]
    expect(record).toMatchObject({ status: 'Stopped', reason: '用户取消工具执行' })
    expect(record?.history).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'message',
        role: 'assistant',
        content: '已停止本次操作。',
      }),
    ]))
    expect(onEndBusinessInstance).toHaveBeenCalledWith(expect.objectContaining({
      moduleId: 'task',
      moduleInstanceId: 'task-a',
    }), expect.objectContaining({
      status: 'abort',
      reason: '用户取消工具执行',
    }))
  })

  it('rejects business kits whose runtime inspect report is not ok', () => {
    expect(() => createAiBusinessKit({
      businessId: 'broken',
      name: '破损业务',
      description: '用于验证 fail-fast。',
      rootModule: new AiModule({
        kind: 'broken',
        name: 'Broken',
        description: 'Broken root.',
        children: ['missing-child'],
        list: () => AiModuleResult.ok<readonly AiModuleInstanceRef[]>([]),
        find: () => AiModuleResult.ok<readonly AiModuleInstanceRef[]>([{ id: 'broken-1', label: 'Broken' }]),
      }),
      input: {
        paramsSchema: paramsSchema({
          id: stringSchema('业务 ID'),
          message: stringSchema('用户消息'),
        }, ['id', 'message']),
        identityField: 'id',
        messageField: 'message',
        systemPrompt: '按固定 module_* 工具协议处理。',
      },
    })).toThrow('firstFinding=error/CHILD_KIND_NOT_REGISTERED')
  })
})

describe('AiAgent session history', () => {
  it('reuses the same business instance history across turns and stop keeps transcript', async () => {
    const store = new DefaultAiAgentSessionStore()
    const registration = createRegistration(store)
    const { callbacks } = createCallbacks()
    const host = createAiAgentHost({ turnCallbacks: callbacks, maxToolRounds: 2 }).register('task', registration)

    const first = await host.run('task', { id: 'task-a', message: '第一轮' })
    const second = await host.run('task', { id: 'task-a', message: '第二轮' })

    expect(first.session.sessionId).toBe(second.session.sessionId)
    const recordBeforeStop = second.session.getSessionRecord()
    expect(summarizeAiAgentSessionRecord(recordBeforeStop)).toMatchObject({
      status: 'Started',
      failedToolCallCount: 2,
      functionNames: ['module_call', 'module_call'],
    })

    expect(host.listSessions('task')).toHaveLength(1)
    expect(host.listSessions()).toHaveLength(1)

    const recordAfterStop = await second.session.stop('manual-stop')
    const transcript = createAiAgentSessionTranscript(recordAfterStop)

    expect(recordAfterStop).toMatchObject({ status: 'Stopped', reason: 'manual-stop' })
    expect(host.listSessions('task')[0]).toMatchObject({ status: 'Stopped', reason: 'manual-stop' })
    expect(transcript.some((entry) => entry.kind === 'functionCall' && entry.status === 'failed')).toBe(true)
    expect(transcript.some((entry) => entry.kind === 'message' && entry.content === '第二轮')).toBe(true)
  })
})
