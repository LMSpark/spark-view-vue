import { describe, expect, it } from 'vitest'

import {
  AiAgentScope,
  DefaultAiAgentSessionStore,
  createAiBusinessKit,
  createAiAgentHost,
  createAiAgentRegistration,
  createAiAgentSessionTranscript,
  createSimpleInputContract,
  summarizeAiAgentSessionRecord,
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

function createRegistration(store = new DefaultAiAgentSessionStore()) {
  return createAiAgentRegistration<TaskInput>({
    kindID: 'task',
    name: '任务助手',
    description: '测试任务助手',
    runtime: createRuntime(),
    sessionStore: store,
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

function createCallbacks(): { callbacks: AiAgentTurnCallbacks; rounds: string[][] } {
  const rounds: string[][] = []
  const callbacks: AiAgentTurnCallbacks = {
    prepareSession: async (input) => {
      rounds.push(input.tools.map((tool) => tool.function.name))
    },
    executeTurn: async (input) => {
      rounds.push(input.tools.map((tool) => tool.function.name))
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
  return { callbacks, rounds }
}

describe('AiAgentHost public API', () => {
  it('registers, ensures and runs by alias without dynamic run map', async () => {
    const { callbacks, rounds } = createCallbacks()
    const host = createAiAgentHost({ turnCallbacks: callbacks, maxToolRounds: 2 })
      .register('taskAssistant', createRegistration())

    expect(host.has('taskAssistant')).toBe(true)
    await host.run('taskAssistant', { id: 'task-a', message: '执行任务' })

    expect(rounds[0]).toEqual([
      'module_query',
      'module_guide',
      'module_find',
      'module_attr',
      'module_call',
      'human_question',
    ])
    expect(Reflect.get(host, 'taskAssistant')).toBeUndefined()
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
    const inputContract = createSimpleInputContract<TicketInput>({
      businessId: 'ticket',
      paramsSchema: paramsSchema({
        ticketId: stringSchema('工单 ID'),
        message: stringSchema('用户消息'),
      }, ['ticketId', 'message']),
      identityField: 'ticketId',
      messageField: 'message',
      systemPrompt: (input) => `当前工单：${input.ticketId}。按固定 module_* 工具协议处理。`,
    })
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
      inputContract,
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
      tools: expect.arrayContaining(['module_query', 'module_call']),
    })
    expect(host.unregister('ticketAssistant').has('ticketAssistant')).toBe(false)
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

    const context = {
      moduleId: 'task',
      moduleInstanceId: 'task-a',
      instanceId: 'task-a',
    }
    store.stopSession(context, 'manual-stop')
    const recordAfterStop = store.getSession(context)
    const transcript = createAiAgentSessionTranscript(recordAfterStop)

    expect(recordAfterStop).toMatchObject({ status: 'Stopped', reason: 'manual-stop' })
    expect(transcript.some((entry) => entry.kind === 'functionCall' && entry.status === 'failed')).toBe(true)
    expect(transcript.some((entry) => entry.kind === 'message' && entry.content === '第二轮')).toBe(true)
  })
})
