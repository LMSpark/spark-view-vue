/**
 * Host 直连 module-semantic 注册测试。
 */

import { describe, expect, it } from 'vitest'
import { readProperty } from '@spark-view/spark-utils/internal'
import { createSparkCapabilityContext, sparkConsume, sparkProvide } from '@spark-view/spark-utils'

import {
  AI_HOST,
  AiHostBusinessTarget,
  DefaultAiHostSessionStore,
  AiHostToolLoopRunner,
  createAiHost,
  createAiHostBusinessScope,
  createAiHostBusinessSession,
  createAiHostBusinessTask,
  runAiHostBusiness,
  startRegistrationSession,
  type AiHostBusinessRegistration,
  type AiHostStreamEvent,
  type AiHostTurnCallbacks,
} from '../host'
import {
  ModuleCheckEntry,
  ModuleKind,
  ModuleOperationResult,
  ModuleSemanticRuntime,
  ModuleSemanticToolCodec,
  PROTOCOL_TOOL_NAMES,
  type ModuleInstanceRef,
  type ModulePathContext,
} from '../module-semantic'
import { paramsSchema, stringSchema, type LlmJsonParamShape, type LlmJsonValue } from '../schema'

type PageDesignTaskInput = LlmJsonParamShape<{
  pageId: string
  userRequirement: string
}>

type ModuleKindSpy = {
  lastHost?: ModulePathContext['host']
}

function createNodeTreeKind(spy: ModuleKindSpy = {}): ModuleKind {
  return new ModuleKind({
    kind: 'node-tree',
    name: '节点树',
    description: '页面节点树',
    functions: [
      {
        name: 'getNode',
        description: '按 id 取节点',
        paramsSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false,
        },
        resultSchema: {
          node: '节点对象',
        },
        example: { id: 'n1' },
        usageRules: ['只能在已知节点 id 时调用'],
        failureModes: [
          { code: 'NODE_NOT_FOUND', when: '指定 id 不存在', fix: '先调用 listChildren 取得真实 id' },
        ],
      },
    ],
    children: [],
    runner: (ctx, functionName, args) => {
      spy.lastHost = ctx.host
      if (functionName !== 'getNode') {
        return ModuleOperationResult.fail([ModuleCheckEntry.error('UNKNOWN_ACTION', functionName)])
      }
      const id = args['id']
      if (typeof id !== 'string' || id.length === 0) {
        return ModuleOperationResult.failCode('NODE_NOT_FOUND', 'id 为空', '先调 listChildren 取真实 id')
      }
      return ModuleOperationResult.ok<LlmJsonValue>({ id, label: `node-${id}` })
    },
    list: () => ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([]),
    find: (ctx) => {
      spy.lastHost = ctx.host
      return ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([
        { id: ctx.host?.moduleInstanceId ?? 'node-tree-1', label: '当前节点树' },
      ])
    },
  })
}

const CONTEXT = {
  moduleId: 'pageDesign',
  moduleInstanceId: 'page-1',
  instanceId: 'page-1',
}

const SCOPE = {
  businessRegistrationId: 'pageDesign',
  businessInstanceId: 'page-1',
  instanceId: 'page-1',
  runtimeInstanceId: 'page-1',
}

const TURN = {
  turnId: 'turn-1',
  seq: 1,
  baseRevision: 0,
  queuedAt: '2026-05-21T00:00:00.000Z',
  startedAt: '2026-05-21T00:00:00.000Z',
  maxParallelTurns: 1,
}

function createRegistration(): { registration: AiHostBusinessRegistration; spy: ModuleKindSpy; released: string[] } {
  const runtime = new ModuleSemanticRuntime()
  const spy: ModuleKindSpy = {}
  const moduleKind = createNodeTreeKind(spy)
  runtime.registerKind(moduleKind)
  const released: string[] = []
  return {
    spy,
    released,
    registration: {
      moduleId: 'pageDesign',
      name: 'Page Design',
      description: '页面设计',
      runtime,
      sessionStore: new DefaultAiHostSessionStore({ now: () => 1000 }),
      afterFunctionCall: (call) => call.result.ok
        ? { status: 'complete', reason: 'done', releaseInstance: true }
        : { status: 'continue' },
      releaseModuleInstance: (moduleInstanceId) => {
        released.push(moduleInstanceId)
      },
    },
  }
}

function createTaskRegistration(): AiHostBusinessRegistration<PageDesignTaskInput> {
  const { registration } = createRegistration()
  return {
    ...registration,
    inputContract: {
      paramsSchema: paramsSchema({
        pageId: stringSchema('页面 ID', { minLength: 1 }),
        userRequirement: stringSchema('用户需求', { minLength: 1 }),
      }, ['pageId', 'userRequirement']),
      identityField: 'pageId',
      normalize: (input) => {
        const pageId = input['pageId']
        const userRequirement = input['userRequirement']
        return {
          pageId: typeof pageId === 'string' ? pageId.trim() : '',
          userRequirement: typeof userRequirement === 'string' ? userRequirement.trim() : '',
        }
      },
      toScope: (input) => createAiHostBusinessScope('pageDesign', input.pageId),
      toOrchestration: (input) => ({
        userMessage: input.userRequirement,
        systemPrompt: `registered task for ${input.pageId}`,
      }),
    },
  }
}

function assertAiHostRunTypes(): void {
  const turnCallbacks: AiHostTurnCallbacks = {
    executeTurn: () => Promise.resolve({ text: 'ok', toolCalls: [] }),
    appendMessages: () => Promise.resolve(),
  }
  const host = createAiHost({ turnCallbacks, maxToolRounds: 1 }).reg('pageDesign', createTaskRegistration())
  void host.run.pageDesign({ pageId: 'page-1', userRequirement: 'make it nice' })
  // @ts-expect-error pageDesign 业务启动输入必须包含 userRequirement。
  void host.run.pageDesign({ pageId: 'page-1' })
}

void assertAiHostRunTypes

describe('AiHostBusinessRegistration + ModuleSemanticRuntime', () => {
  it('createAiHostBusinessTask 通过注册化输入契约创建任务并映射实例身份', () => {
    const registration = createTaskRegistration()
    const task = createAiHostBusinessTask({ get: () => registration }, 'pageDesign', {
      pageId: ' page-1 ',
      userRequirement: '  设计一个客户页面  ',
    })
    const request = task.toChatRequest({ systemPrompt: 'extra task prompt' })

    expect(task.target).toBeInstanceOf(AiHostBusinessTarget)
    expect(task.target.businessInstanceId).toBe('page-1')
    expect(task.scope).toMatchObject({ businessRegistrationId: 'pageDesign', businessInstanceId: 'page-1' })
    expect(task.normalizedInput).toMatchObject({ pageId: 'page-1', userRequirement: '设计一个客户页面' })
    expect(request.historyMsgs).toEqual([{ role: 'user', content: '设计一个客户页面' }])
    expect(request.systemPrompt).not.toContain('AI Host 任务输入')
    expect(request.systemPrompt).toContain('kindID=pageDesign')
    expect(request.systemPrompt).toContain('businessInstanceId=page-1')
    expect(request.systemPrompt).toContain('"pageId":"page-1"')
    expect(request.systemPrompt).not.toContain('"userRequirement":"设计一个客户页面"')
    expect(request.systemPrompt).toContain('registered task for page-1')
    expect(request.systemPrompt).toContain('extra task prompt')
  })

  it('createAiHostBusinessTask 对未注册 kindID 和非法输入 fail-fast', () => {
    const registration = createTaskRegistration()

    expect(() => createAiHostBusinessTask({ get: () => undefined }, 'missingKind', {}))
      .toThrow('AI host business kindID is not registered: missingKind')
    expect(() => createAiHostBusinessTask({ get: () => registration }, 'pageDesign', { pageId: 'page-1' }))
      .toThrow('failed schema validation')
    const { inputContract: _missingInputContract, ...registrationWithoutInputContract } = registration
    expect(() => createAiHostBusinessTask({ get: () => registrationWithoutInputContract }, 'pageDesign', {
      pageId: 'page-1',
      userRequirement: 'x',
    })).toThrow('missing inputContract')
  })

  it('runAiHostBusiness 一站式创建 task、启动 session 并发送请求', async () => {
    const registration = createTaskRegistration()
    const streamInputs: Array<{ sessionId: string; content: string; systemPrompt: string }> = []
    const turnCallbacks: AiHostTurnCallbacks = {
      executeTurn: (input) => {
        streamInputs.push({
          sessionId: input.sessionId,
          content: input.messages.map((message) => message.content).join('\n'),
          systemPrompt: input.systemPrompt,
        })
        return Promise.resolve({ text: 'ok', toolCalls: [] })
      },
      appendMessages: () => Promise.resolve(),
    }

    const result = await runAiHostBusiness({
      options: {
        registry: { get: () => registration },
        turnCallbacks,
        maxToolRounds: 1,
      },
      kindID: 'pageDesign',
      input: {
        pageId: ' page-1 ',
        userRequirement: '  设计一个客户页面  ',
      },
      chat: {
        systemPrompt: '额外运行提示',
        turn: TURN,
      },
    })

    expect(result.task.target.businessInstanceId).toBe('page-1')
    expect(result.session.sessionId).toBe('pageDesign:page-1')
    expect(streamInputs).toHaveLength(1)
    expect(streamInputs[0]).toMatchObject({
      sessionId: 'pageDesign:page-1',
      content: '设计一个客户页面',
    })
    expect(streamInputs[0]?.systemPrompt).toContain('registered task for page-1')
    expect(streamInputs[0]?.systemPrompt).toContain('额外运行提示')
  })

  it('createAiHost 通过 alias 注册并运行具体业务', async () => {
    const registration = createTaskRegistration()
    const streamInputs: Array<{ sessionId: string; content: string }> = []
    const turnCallbacks: AiHostTurnCallbacks = {
      executeTurn: (input) => {
        streamInputs.push({
          sessionId: input.sessionId,
          content: input.messages.map((message) => message.content).join('\n'),
        })
        return Promise.resolve({ text: 'ok', toolCalls: [] })
      },
      appendMessages: () => Promise.resolve(),
    }

    const host = createAiHost({ turnCallbacks, maxToolRounds: 1 }).reg('pageDesign', registration)
    const result = await host.run.pageDesign({
      pageId: ' page-1 ',
      userRequirement: '  设计一个客户页面  ',
    }, { turn: TURN })

    expect(result.task.normalizedInput['pageId']).toBe('page-1')
    expect(result.session.sessionId).toBe('pageDesign:page-1')
    expect(streamInputs).toEqual([{ sessionId: 'pageDesign:page-1', content: '设计一个客户页面' }])
    await expect(host.runByAlias('missing', {
      pageId: 'page-1',
      userRequirement: 'x',
    })).rejects.toThrow('AI host run alias is not registered: missing')
  })

  it('createAiHost 对 alias/moduleId 冲突 fail-fast,ensureReg 可幂等复用', () => {
    const turnCallbacks: AiHostTurnCallbacks = {
      executeTurn: () => Promise.resolve({ text: 'ok', toolCalls: [] }),
      appendMessages: () => Promise.resolve(),
    }
    const host = createAiHost({ turnCallbacks, maxToolRounds: 1 })
    let creates = 0
    const ensured = host.ensureReg('pageDesign', {
      moduleId: 'pageDesign',
      create: () => {
        creates += 1
        return createTaskRegistration()
      },
    })
    const ensuredAgain = ensured.ensureReg('pageDesign', {
      moduleId: 'pageDesign',
      create: () => {
        creates += 1
        return createTaskRegistration()
      },
    })

    expect(ensuredAgain.has('pageDesign')).toBe(true)
    expect(creates).toBe(1)
    expect(() => ensuredAgain.reg('pageDesign', createTaskRegistration())).toThrow('Duplicate AI host run alias')
    expect(() => ensuredAgain.reg('otherPageDesign', createTaskRegistration())).toThrow('Duplicate AI host business registration')
    expect(() => ensuredAgain.ensureReg('pageDesign', {
      moduleId: 'otherModule',
      create: () => createTaskRegistration(),
    })).toThrow('already bound to moduleId "pageDesign"')
    expect(() => ensuredAgain.ensureReg('otherAlias', {
      moduleId: 'pageDesign',
      create: () => createTaskRegistration(),
    })).toThrow('already bound to alias "pageDesign"')
  })

  it('AI_HOST 能力键通过结构校验传输 Host 单例', () => {
    const turnCallbacks: AiHostTurnCallbacks = {
      executeTurn: () => Promise.resolve({ text: 'ok', toolCalls: [] }),
      appendMessages: () => Promise.resolve(),
    }
    const host = createAiHost({ turnCallbacks, maxToolRounds: 1 })
    const context = createSparkCapabilityContext({ id: 'ai-host-test', type: 'test' })

    sparkProvide(context, AI_HOST, host)

    expect(sparkConsume(context, AI_HOST)).toBe(host)
  })

  it('startRegistrationSession 返回 query/navigation tools 与 business function tools', async () => {
    const { registration } = createRegistration()
    const started = await startRegistrationSession(registration, CONTEXT)
    expect(started.status).toBe('Started')
    expect(started.moduleId).toBe('pageDesign')
    expect(started.tools.map((tool) => tool.function.name)).toEqual([
      PROTOCOL_TOOL_NAMES.queryModules,
      PROTOCOL_TOOL_NAMES.queryFunctions,
      PROTOCOL_TOOL_NAMES.guideFunction,
      PROTOCOL_TOOL_NAMES.guideHumanQuestion,
      PROTOCOL_TOOL_NAMES.getAttribute,
      PROTOCOL_TOOL_NAMES.setAttribute,
      PROTOCOL_TOOL_NAMES.listChildren,
      PROTOCOL_TOOL_NAMES.findInstance,
      PROTOCOL_TOOL_NAMES.describeKind,
      'node-tree_getNode',
    ])
  })

  it('tool loop 执行 OpenAI function tool,记录 Host 命名历史并透传 host scope', async () => {
    const { registration, spy, released } = createRegistration()
    await startRegistrationSession(registration, CONTEXT)
    const turnCallbacks: AiHostTurnCallbacks = {
      executeTurn: (input) => {
        expect(input.sessionId).toBe('pageDesign:page-1')
        expect(input.scope.instanceId).toBe('page-1')
        return Promise.resolve({
        text: '',
        toolCalls: [{
          id: 'call-1',
          type: 'function',
          function: {
            name: 'node-tree_getNode',
            arguments: JSON.stringify({
              $paths: ['page-1'],
              id: 'n1',
            }),
          },
        }],
        })
      },
      appendMessages: () => Promise.resolve(),
    }
    const runner = new AiHostToolLoopRunner(turnCallbacks, 1)
    let cleared = false
    const streamEvents: AiHostStreamEvent[] = []

    await runner.runToolLoop({
      registration,
      scope: SCOPE,
      request: { historyMsgs: [], onStreamEvent: (event) => streamEvents.push(event) },
      turn: TURN,
      clearSelected: () => {
      cleared = true
      },
    })

    expect(spy.lastHost).toEqual(CONTEXT)
    const history = registration.sessionStore?.getSessionHistory(CONTEXT) ?? []
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      kind: 'functionCall',
      toolName: 'node-tree_getNode',
      status: 'completed',
    })
    expect(registration.sessionStore?.getSession(CONTEXT)?.status).toBe('Stopped')
    expect(released).toEqual(['page-1'])
    expect(cleared).toBe(true)
    const toolResultEvent = streamEvents.find((event) => event.type === 'tool-result')
    expect(toolResultEvent?.scope.eventModuleId).toBe('node-tree')
    expect(toolResultEvent?.streamKey).toContain('node-tree')
  })

  it('协议失败映射为 AiHostFunctionCallResult failure 并记录 failed', async () => {
    const { registration } = createRegistration()
    await startRegistrationSession(registration, CONTEXT)
    let round = 0
    let secondRoundMessages: readonly unknown[] = []
    let appendedMessages: readonly unknown[] = []
    const turnCallbacks: AiHostTurnCallbacks = {
      executeTurn: (input) => {
        round += 1
        if (round === 1) {
          return Promise.resolve({
            text: '',
            toolCalls: [{
              type: 'function',
              id: 'call-node-empty',
              function: {
                name: 'node-tree_getNode',
                arguments: JSON.stringify({
                  $paths: ['page-1'],
                  id: '',
                }),
              },
            }],
          })
        }
        secondRoundMessages = input.messages
        return Promise.resolve({ text: '已收到错误并停止', toolCalls: [] })
      },
      appendMessages: (input) => {
        appendedMessages = input.messages
        return Promise.resolve()
      },
    }
    const calls: string[] = []
    const runner = new AiHostToolLoopRunner(turnCallbacks, 2)

    await runner.runToolLoop({
      registration,
      scope: SCOPE,
      request: { historyMsgs: [], onFcCall: (record) => calls.push(record.status) },
      turn: TURN,
      clearSelected: () => undefined,
    })

    expect(calls).toEqual(['error'])
    expect(secondRoundMessages).toEqual([])
    const toolMessage = appendedMessages.find((message) =>
      typeof message === 'object' && message !== null && 'role' in message && message.role === 'tool'
    )
    expect(toolMessage).toMatchObject({ role: 'tool', tool_call_id: 'call-node-empty' })
    const toolPayload = JSON.parse(String(readProperty(toolMessage, 'content') ?? '{}'))
    expect(toolPayload).toMatchObject({
      ok: false,
      code: 'NODE_NOT_FOUND',
      checks: [
        {
          level: 'error',
          code: 'NODE_NOT_FOUND',
          message: 'id 为空',
          hint: '先调 listChildren 取真实 id',
        },
      ],
    })
    const history = registration.sessionStore?.getSessionHistory(CONTEXT) ?? []
    const failedCall = [...history].reverse().find((entry) => entry.kind === 'functionCall')
    expect(failedCall).toMatchObject({
      kind: 'functionCall',
      status: 'failed',
      error: {
        code: 'NODE_NOT_FOUND',
        checks: [
          {
            code: 'NODE_NOT_FOUND',
            message: 'id 为空',
          },
        ],
      },
    })
  })

  it('工具调用参数不是 JSON object 时 fail-fast 并回灌给 LLM', async () => {
    const { registration, spy } = createRegistration()
    await startRegistrationSession(registration, CONTEXT)
    let appendedMessages: readonly unknown[] = []
    const records: Array<{ status: string; code?: string }> = []
    const turnCallbacks: AiHostTurnCallbacks = {
      executeTurn: () => Promise.resolve({
        text: '',
        toolCalls: [{
          type: 'function',
          id: 'call-invalid-json',
          function: {
            name: 'node-tree_getNode',
            arguments: '{not-json',
          },
        }],
      }),
      appendMessages: (input) => {
        appendedMessages = input.messages
        return Promise.resolve()
      },
    }
    const runner = new AiHostToolLoopRunner(turnCallbacks, 1)

    await runner.runToolLoop({
      registration,
      scope: SCOPE,
      request: {
        historyMsgs: [],
        onFcCall: (record) => {
          if (record.result.ok) {
            records.push({ status: record.status })
            return
          }
          records.push({ status: record.status, code: record.result.code })
        },
      },
      turn: TURN,
      clearSelected: () => undefined,
    })

    expect(spy.lastHost).toBeUndefined()
    expect(records).toEqual([{ status: 'error', code: 'TOOL_ARGS_INVALID_JSON' }])
    const toolMessage = appendedMessages.find((message) =>
      typeof message === 'object' && message !== null && 'role' in message && message.role === 'tool'
    )
    const toolPayload = JSON.parse(String(readProperty(toolMessage, 'content') ?? '{}'))
    expect(toolPayload).toMatchObject({
      ok: false,
      code: 'TOOL_ARGS_INVALID_JSON',
      checks: [
        {
          level: 'error',
          code: 'TOOL_ARGS_INVALID_JSON',
        },
      ],
    })
    const history = registration.sessionStore?.getSessionHistory(CONTEXT) ?? []
    const failedCall = [...history].reverse().find((entry) => entry.kind === 'functionCall')
    expect(failedCall).toMatchObject({
      kind: 'functionCall',
      toolName: 'node-tree_getNode',
      args: {},
      status: 'failed',
      error: {
        code: 'TOOL_ARGS_INVALID_JSON',
      },
    })
  })

  it('工具调用参数是合法 JSON 但不是 object 时 fail-fast 并回灌 TOOL_ARGS_NOT_OBJECT', async () => {
    const { registration, spy } = createRegistration()
    await startRegistrationSession(registration, CONTEXT)
    let appendedMessages: readonly unknown[] = []
    const records: Array<{ status: string; code?: string }> = []
    const turnCallbacks: AiHostTurnCallbacks = {
      executeTurn: () => Promise.resolve({
        text: '',
        toolCalls: [{
          type: 'function',
          id: 'call-not-object',
          function: {
            name: 'node-tree_getNode',
            arguments: '"this is a string, not an object"',
          },
        }],
      }),
      appendMessages: (input) => {
        appendedMessages = input.messages
        return Promise.resolve()
      },
    }
    const runner = new AiHostToolLoopRunner(turnCallbacks, 1)

    await runner.runToolLoop({
      registration,
      scope: SCOPE,
      request: {
        historyMsgs: [],
        onFcCall: (record) => {
          if (record.result.ok) {
            records.push({ status: record.status })
            return
          }
          records.push({ status: record.status, code: record.result.code })
        },
      },
      turn: TURN,
      clearSelected: () => undefined,
    })

    expect(spy.lastHost).toBeUndefined()
    expect(records).toEqual([{ status: 'error', code: 'TOOL_ARGS_NOT_OBJECT' }])
    const toolMessage = appendedMessages.find((message) =>
      typeof message === 'object' && message !== null && 'role' in message && message.role === 'tool'
    )
    const toolPayload = JSON.parse(String(readProperty(toolMessage, 'content') ?? '{}'))
    expect(toolPayload).toMatchObject({
      ok: false,
      code: 'TOOL_ARGS_NOT_OBJECT',
      checks: [
        {
          level: 'error',
          code: 'TOOL_ARGS_NOT_OBJECT',
        },
      ],
    })
  })

  it('tool loop systemPrompt 自动拼入 ModuleKind 分层知识快照', async () => {
    const { registration: baseRegistration } = createRegistration()
    const registration: AiHostBusinessRegistration = {
      ...baseRegistration,
      systemPrompt: () => '运行时提示',
    }
    await startRegistrationSession(registration, CONTEXT)
    let systemPrompt = ''
    const turnCallbacks: AiHostTurnCallbacks = {
      executeTurn: (input) => {
        systemPrompt = input.systemPrompt
        return Promise.resolve({
          text: 'ok',
          toolCalls: [],
        })
      },
      appendMessages: () => Promise.resolve(),
    }
    const runner = new AiHostToolLoopRunner(turnCallbacks, 1)

    await runner.runToolLoop({
      registration,
      scope: SCOPE,
      request: { historyMsgs: [], systemPrompt: '请求提示' },
      turn: TURN,
      clearSelected: () => undefined,
    })

    expect(systemPrompt).toContain('运行时提示')
    expect(systemPrompt).toContain('请求提示')
    expect(systemPrompt).not.toContain('【AI Knowledge Snapshot】')
    expect(systemPrompt).toContain('工具：')
    expect(systemPrompt).toContain('流程：')
    expect(systemPrompt).not.toContain('函数目录摘要')
  })

  it('同一业务会话下多个 turn 共享 sessionId 但保持 turnId 隔离', async () => {
    const { registration } = createRegistration()
    const streamInputs: Array<{ sessionId: string; turnId: string; instanceId: string; content: string }> = []
    const turnCallbacks: AiHostTurnCallbacks = {
      executeTurn: (input) => {
        streamInputs.push({
          sessionId: input.sessionId,
          turnId: input.turn.turnId,
          instanceId: input.scope.instanceId,
          content: input.messages.map((message) => message.content).join('\n'),
        })
        return Promise.resolve({ text: 'ok', toolCalls: [] })
      },
      appendMessages: () => Promise.resolve(),
    }
    const session = createAiHostBusinessSession({
      registry: { get: () => registration },
      turnCallbacks,
      maxToolRounds: 1,
    }, new AiHostBusinessTarget('pageDesign', 'page-1'))

    await session.start()
    await session.send({
      historyMsgs: [{ role: 'user', content: '第一轮' }],
      turn: { ...TURN, turnId: 'turn-a', seq: 1 },
    })
    await session.send({
      historyMsgs: [{ role: 'user', content: '第二轮' }],
      turn: { ...TURN, turnId: 'turn-b', seq: 2 },
    })

    expect(session.sessionId).toBe('pageDesign:page-1')
    expect(streamInputs).toEqual([
      { sessionId: 'pageDesign:page-1', turnId: 'turn-a', instanceId: 'page-1', content: '第一轮' },
      { sessionId: 'pageDesign:page-1', turnId: 'turn-b', instanceId: 'page-1', content: '第二轮' },
    ])
  })
})

describe('ModuleSemanticToolCodec', () => {
  it('actionOf 对已知 OpenAI function toolName 原样返回;未知工具返回 null', () => {
    const runtime = new ModuleSemanticRuntime()
    runtime.registerKind(createNodeTreeKind())
    const codec = new ModuleSemanticToolCodec(runtime.getLlmTools())
    expect(codec.actionOf('node-tree_getNode')).toBe('node-tree_getNode')
    expect(codec.actionOf('describeKind')).toBe('describeKind')
    expect(codec.actionOf('unknown-tool')).toBeNull()
  })

  it('tools 暴露 OpenAI function tool transport spec', () => {
    const runtime = new ModuleSemanticRuntime()
    runtime.registerKind(createNodeTreeKind())
    const codec = new ModuleSemanticToolCodec(runtime.getLlmTools())
    expect(codec.tools).toHaveLength(10)
    for (const tool of codec.tools) {
      expect(tool.type).toBe('function')
      expect(tool.function.parameters['type']).toBe('object')
      expect(tool.function.strict).toBe(false)
    }
  })
})
