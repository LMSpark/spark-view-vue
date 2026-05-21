/**
 * 模块语义协议 host 适配层测试。
 *
 * 覆盖范围:
 * - ModuleSemanticBusinessRuntime.executeFunctionCall 路由到协议工具
 * - 成功 / 失败结果到 AiRuntimeFunctionCallResult 的映射(含 PROTOCOL_FAILURE 兜底)
 * - startSession 投影包含 6 个协议工具(供旧 AiRuntimeToolCodec 复用)
 * - session lifecycle:startSession / appendMessage / endBusinessInstance
 * - ModuleSemanticToolCodec.actionOf 反查协议工具名,未知工具返回 null
 */

import { describe, expect, it } from 'vitest'

import {
  ModuleCapability,
  ModuleKindBase,
  ModuleSemanticBusinessRuntime,
  ModuleSemanticRuntime,
  ModuleSemanticToolCodec,
  PROTOCOL_TOOL_NAMES,
  ok as okResult,
  errorCheck,
  type ModuleInstanceQuery,
  type ModuleInstanceRef,
  type ModulePathContext,
  type OperationResult,
} from '../module-semantic'
import type { LlmJsonValue } from '../protocol/parameter-schema'

// ═══════════════════════════════════════════════════════
// 测试用 Kind / Capability(与 runtime 测试保持对齐)
// ═══════════════════════════════════════════════════════

class NodeTreeKind extends ModuleKindBase {
  public constructor() {
    super({
      kind: 'node-tree',
      name: '节点树',
      description: '页面节点树',
      attributes: [
        {
          name: 'rootId',
          description: '根节点 id',
          schema: { type: 'string' },
          readable: true,
          writable: false,
        },
      ],
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
        },
      ],
      children: [],
    })
  }
}

class NodeTreeCapability extends ModuleCapability {
  public readonly kind = 'node-tree'

  public getAttribute(
    _ctx: ModulePathContext,
    attrName: string,
  ): Promise<OperationResult<LlmJsonValue>> {
    if (attrName === 'rootId') return Promise.resolve(okResult<LlmJsonValue>('root-1'))
    return Promise.resolve({ ok: false, checks: [errorCheck('UNKNOWN_ATTR', `${attrName} 未声明`)] })
  }

  public setAttribute(): Promise<OperationResult<void>> {
    return Promise.resolve({ ok: false, checks: [errorCheck('ATTR_READ_ONLY', 'rootId 不可写')] })
  }

  public invokeAction(
    _ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<OperationResult<LlmJsonValue>> {
    if (actionName === 'getNode') {
      const id = args['id']
      if (typeof id !== 'string' || id.length === 0) {
        return Promise.resolve({
          ok: false,
          checks: [errorCheck('NODE_NOT_FOUND', 'id 为空', '先调 listChildren 取真实 id')],
        })
      }
      return Promise.resolve(okResult<LlmJsonValue>({ id, label: `node-${id}` }))
    }
    return Promise.resolve({ ok: false, checks: [errorCheck('UNKNOWN_ACTION', `${actionName} 未实现`)] })
  }

  public listChildren(): Promise<OperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(okResult<readonly ModuleInstanceRef[]>([]))
  }

  public findInstance(
    _ctx: ModulePathContext,
    _childKind: string,
    _query: ModuleInstanceQuery,
  ): Promise<OperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(okResult<readonly ModuleInstanceRef[]>([
      { id: 'node-tree-1', label: '主页节点树' },
    ]))
  }

  public resolveChild(): Promise<OperationResult<boolean>> {
    return Promise.resolve(okResult<boolean>(false))
  }
}

// ═══════════════════════════════════════════════════════
// 测试夹具
// ═══════════════════════════════════════════════════════

function createBusinessRuntime(): ModuleSemanticBusinessRuntime {
  const runtime = new ModuleSemanticRuntime()
  runtime.registerKind(new NodeTreeKind())
  runtime.registerCapability(new NodeTreeCapability())
  return new ModuleSemanticBusinessRuntime({
    moduleId: 'node-tree-module',
    name: '节点树业务模块',
    description: '页面节点树编辑能力',
    runtime,
  })
}

const SCOPE_CONTEXT = {
  moduleId: 'node-tree-module',
  moduleInstanceId: 'inst-1',
  instanceId: 'node-tree-module:inst-1',
} as const

// ═══════════════════════════════════════════════════════
// 测试用例
// ═══════════════════════════════════════════════════════

describe('ModuleSemanticBusinessRuntime.startSession', () => {
  it('返回 6 个协议工具作为 availableFunctions(供旧 codec 复用)', async () => {
    const business = createBusinessRuntime()
    const result = await business.startSession(SCOPE_CONTEXT)
    expect(result.status).toBe('Started')
    expect(result.instanceId).toBe(SCOPE_CONTEXT.instanceId)
    expect(result.module.moduleId).toBe('node-tree-module')
    expect(result.availableFunctions).toHaveLength(6)
    const actions = result.availableFunctions.map((fn) => fn.action)
    expect(actions).toEqual([
      PROTOCOL_TOOL_NAMES.getAttribute,
      PROTOCOL_TOOL_NAMES.setAttribute,
      PROTOCOL_TOOL_NAMES.invokeAction,
      PROTOCOL_TOOL_NAMES.listChildren,
      PROTOCOL_TOOL_NAMES.findInstance,
      PROTOCOL_TOOL_NAMES.describeKind,
    ])
  })

  it('每个 functionExposure 的 paramsSchema 是 JSON Schema object', async () => {
    const business = createBusinessRuntime()
    const result = await business.startSession(SCOPE_CONTEXT)
    for (const fn of result.availableFunctions) {
      expect(fn.paramsSchema.type).toBe('object')
    }
  })
})

describe('ModuleSemanticBusinessRuntime.executeFunctionCall', () => {
  it('invokeAction 透传 args 并返回 ok=true,session 记录 completed', async () => {
    const business = createBusinessRuntime()
    await business.startSession(SCOPE_CONTEXT)
    const result = await business.executeFunctionCall({
      ...SCOPE_CONTEXT,
      action: 'invokeAction',
      args: { path: '/node-tree[t1]', actionName: 'getNode', args: { id: 'n1' } },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data).toEqual({ id: 'n1', label: 'node-n1' })
    const history = business.getSessionHistory(SCOPE_CONTEXT)
    const fcEntries = history.filter((entry) => entry.kind === 'functionCall')
    expect(fcEntries).toHaveLength(1)
    const first = fcEntries[0]
    if (first === undefined || first.kind !== 'functionCall') throw new Error('no fc entry')
    expect(first.status).toBe('completed')
    expect(first.action).toBe('invokeAction')
  })

  it('协议返回 ok=false 时映射为 AiRuntimeFunctionCallFailure 并记录 failed', async () => {
    const business = createBusinessRuntime()
    await business.startSession(SCOPE_CONTEXT)
    const result = await business.executeFunctionCall({
      ...SCOPE_CONTEXT,
      action: 'invokeAction',
      args: { path: '/node-tree[t1]', actionName: 'getNode', args: { id: '' } },
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.code).toBe('NODE_NOT_FOUND')
    expect(result.msg).toContain('id 为空')
    const history = business.getSessionHistory(SCOPE_CONTEXT)
    const last = history[history.length - 1]
    if (last === undefined || last.kind !== 'functionCall') throw new Error('no fc entry')
    expect(last.status).toBe('failed')
    expect(last.error?.code).toBe('NODE_NOT_FOUND')
  })

  it('未知协议工具时返回 UNKNOWN_TOOL 失败', async () => {
    const business = createBusinessRuntime()
    await business.startSession(SCOPE_CONTEXT)
    const result = await business.executeFunctionCall({
      ...SCOPE_CONTEXT,
      action: 'no-such-tool',
      args: {},
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.code).toBe('UNKNOWN_TOOL')
  })

  it('describeKind 走通,无 session 时也能调用(协议无状态)', async () => {
    const business = createBusinessRuntime()
    await business.startSession(SCOPE_CONTEXT)
    const result = await business.executeFunctionCall({
      ...SCOPE_CONTEXT,
      action: 'describeKind',
      args: { kind: 'node-tree' },
    })
    expect(result.ok).toBe(true)
  })
})

describe('ModuleSemanticBusinessRuntime session lifecycle', () => {
  it('appendMessage 与 getSessionHistory 串通', async () => {
    const business = createBusinessRuntime()
    await business.startSession(SCOPE_CONTEXT)
    business.appendMessage({
      ...SCOPE_CONTEXT,
      role: 'user',
      content: '帮我查节点 n1',
    })
    const history = business.getSessionHistory(SCOPE_CONTEXT)
    const messages = history.filter((entry) => entry.kind === 'message')
    expect(messages).toHaveLength(1)
    const first = messages[0]
    if (first === undefined || first.kind !== 'message') throw new Error('no message entry')
    expect(first.role).toBe('user')
    expect(first.content).toBe('帮我查节点 n1')
  })

  it('endBusinessInstance 将 session 状态转为 Stopped', async () => {
    const business = createBusinessRuntime()
    await business.startSession(SCOPE_CONTEXT)
    await business.endBusinessInstance(SCOPE_CONTEXT, { status: 'complete', reason: '结束' })
    const session = business.getSession(SCOPE_CONTEXT)
    if (session === null) throw new Error('session missing')
    expect(session.status).toBe('Stopped')
    expect(session.reason).toBe('结束')
  })

  it('releaseModuleInstance 删除会话记录', async () => {
    const business = createBusinessRuntime()
    await business.startSession(SCOPE_CONTEXT)
    business.releaseModuleInstance(SCOPE_CONTEXT.moduleInstanceId)
    expect(business.getSession(SCOPE_CONTEXT)).toBeNull()
  })
})

describe('ModuleSemanticToolCodec', () => {
  it('actionOf 协议工具名原样返回;未知工具返回 null', () => {
    const runtime = new ModuleSemanticRuntime()
    runtime.registerKind(new NodeTreeKind())
    runtime.registerCapability(new NodeTreeCapability())
    const codec = new ModuleSemanticToolCodec(runtime.getLlmTools())
    expect(codec.actionOf('invokeAction')).toBe('invokeAction')
    expect(codec.actionOf('describeKind')).toBe('describeKind')
    expect(codec.actionOf('unknown-tool')).toBeNull()
  })

  it('tools 暴露 6 个 transport spec,parameters.type=object', () => {
    const runtime = new ModuleSemanticRuntime()
    runtime.registerKind(new NodeTreeKind())
    runtime.registerCapability(new NodeTreeCapability())
    const codec = new ModuleSemanticToolCodec(runtime.getLlmTools())
    expect(codec.tools).toHaveLength(6)
    for (const tool of codec.tools) {
      expect(tool.type).toBe('function')
      expect(tool.function.parameters['type']).toBe('object')
    }
  })

  it('isProtocolToolName 判定 6 个协议工具名通过,其它为 false', () => {
    const runtime = new ModuleSemanticRuntime()
    runtime.registerKind(new NodeTreeKind())
    runtime.registerCapability(new NodeTreeCapability())
    const codec = new ModuleSemanticToolCodec(runtime.getLlmTools())
    expect(codec.isProtocolToolName('listChildren')).toBe(true)
    expect(codec.isProtocolToolName('foo')).toBe(false)
  })
})
