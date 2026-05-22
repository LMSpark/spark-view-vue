/**
 * Host 直连 module-semantic 注册测试。
 */

import { describe, expect, it } from 'vitest'

import {
  DefaultAiHostSessionStore,
  AiHostToolLoopRunner,
  startRegistrationSession,
  type AiHostBusinessRegistration,
  type AiHostTransport,
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
import type { LlmJsonValue } from '../schema'

type ModuleKindSpy = {
  lastHost?: ModulePathContext['host'] | undefined
}

function createNodeTreeKind(spy: ModuleKindSpy = {}): ModuleKind {
  return new ModuleKind({
    kind: 'node-tree',
    name: '节点树',
    description: '页面节点树',
    actions: [
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
    runner: (ctx, actionName, args) => {
      spy.lastHost = ctx.host
      if (actionName !== 'getNode') {
        return ModuleOperationResult.fail([ModuleCheckEntry.error('UNKNOWN_ACTION', actionName)])
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
  instanceId: 'pageDesign:page-1',
}

const SCOPE = {
  businessRegistrationId: 'pageDesign',
  businessInstanceId: 'page-1',
  instanceId: 'pageDesign:page-1',
  runtimeInstanceId: 'pageDesign:page-1',
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

describe('AiHostBusinessRegistration + ModuleSemanticRuntime', () => {
  it('startRegistrationSession 返回 6 个协议工具', async () => {
    const { registration } = createRegistration()
    const started = await startRegistrationSession(registration, CONTEXT)
    expect(started.status).toBe('Started')
    expect(started.moduleId).toBe('pageDesign')
    expect(started.tools.map((tool) => tool.function.name)).toEqual([
      PROTOCOL_TOOL_NAMES.getAttribute,
      PROTOCOL_TOOL_NAMES.setAttribute,
      PROTOCOL_TOOL_NAMES.invokeAction,
      PROTOCOL_TOOL_NAMES.listChildren,
      PROTOCOL_TOOL_NAMES.findInstance,
      PROTOCOL_TOOL_NAMES.describeKind,
    ])
  })

  it('tool loop 直接执行协议工具,记录 Host 命名历史并透传 host scope', async () => {
    const { registration, spy, released } = createRegistration()
    await startRegistrationSession(registration, CONTEXT)
    const transport: AiHostTransport = {
      streamTurn: () => Promise.resolve({
        text: '',
        toolCalls: [{
          id: 'call-1',
          type: 'function',
          function: {
            name: 'invokeAction',
            arguments: JSON.stringify({
              path: '/node-tree[page-1]',
              actionName: 'getNode',
              args: { id: 'n1' },
            }),
          },
        }],
      }),
      appendMessages: () => Promise.resolve(),
    }
    const runner = new AiHostToolLoopRunner({
      registry: { get: () => registration, list: () => [registration] },
      transport,
      maxToolRounds: 1,
    })
    let cleared = false

    await runner.runToolLoop({
      registration,
      scope: SCOPE,
      request: { historyMsgs: [] },
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
      toolName: 'invokeAction',
      status: 'completed',
    })
    expect(registration.sessionStore?.getSession(CONTEXT)?.status).toBe('Stopped')
    expect(released).toEqual(['page-1'])
    expect(cleared).toBe(true)
  })

  it('协议失败映射为 AiHostFunctionCallResult failure 并记录 failed', async () => {
    const { registration } = createRegistration()
    await startRegistrationSession(registration, CONTEXT)
    const transport: AiHostTransport = {
      streamTurn: () => Promise.resolve({
        text: '',
        toolCalls: [{
          type: 'function',
          function: {
            name: 'invokeAction',
            arguments: JSON.stringify({
              path: '/node-tree[page-1]',
              actionName: 'getNode',
              args: { id: '' },
            }),
          },
        }],
      }),
      appendMessages: () => Promise.resolve(),
    }
    const calls: string[] = []
    const runner = new AiHostToolLoopRunner({
      registry: { get: () => registration, list: () => [registration] },
      transport,
      maxToolRounds: 1,
    })

    await runner.runToolLoop({
      registration,
      scope: SCOPE,
      request: { historyMsgs: [], onFcCall: (record) => calls.push(record.status) },
      turn: TURN,
      clearSelected: () => undefined,
    })

    expect(calls).toEqual(['error'])
    const history = registration.sessionStore?.getSessionHistory(CONTEXT) ?? []
    expect(history.at(-1)).toMatchObject({
      kind: 'functionCall',
      status: 'failed',
      error: {
        code: 'NODE_NOT_FOUND',
      },
    })
  })
})

describe('ModuleSemanticToolCodec', () => {
  it('actionOf 协议工具名原样返回;未知工具返回 null', () => {
    const runtime = new ModuleSemanticRuntime()
    runtime.registerKind(createNodeTreeKind())
    const codec = new ModuleSemanticToolCodec(runtime.getLlmTools())
    expect(codec.actionOf('invokeAction')).toBe('invokeAction')
    expect(codec.actionOf('describeKind')).toBe('describeKind')
    expect(codec.actionOf('unknown-tool')).toBeNull()
  })

  it('tools 暴露 6 个 transport spec,parameters.type=object', () => {
    const runtime = new ModuleSemanticRuntime()
    runtime.registerKind(createNodeTreeKind())
    const codec = new ModuleSemanticToolCodec(runtime.getLlmTools())
    expect(codec.tools).toHaveLength(6)
    for (const tool of codec.tools) {
      expect(tool.type).toBe('function')
      expect(tool.function.parameters['type']).toBe('object')
    }
  })
})
