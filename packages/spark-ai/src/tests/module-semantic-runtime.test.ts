/**
 * 模块语义协议运行时测试。
 *
 * 覆盖范围:
 * - 工具规约固定 6 个、含 usageRules / failureModes / parameters 收紧后的类型
 * - executeTool 路由到 6 个工具(getAttribute / setAttribute / invokeAction /
 *   listChildren / findInstance / describeKind)
 * - 错误码:UNKNOWN_TOOL / INVALID_PATH_* / ACTION_NOT_DECLARED
 * - describeKind 返回 usageRules / failureModes(G1+G3 验证)
 */

import { describe, expect, it } from 'vitest'

import {
  ModuleKind,
  ModuleSemanticRuntime,
  ModulePath,
  PROTOCOL_TOOL_NAMES,
  ok as okResult,
  errorCheck,
  type ModuleInstanceRef,
  type ModulePathContext,
  type ActionSchema,
} from '../module-semantic'
import type { LlmJsonValue } from '../schema'

interface ModuleKindSpy {
  lastHost?: ModulePathContext['host'] | undefined
}

const ECHO_ACTION_SCHEMA: ActionSchema = {
  name: 'echo',
  description: '回显参数',
  paramsSchema: {
    type: 'object',
    properties: {
      value: { type: 'string' },
    },
    required: ['value'],
    additionalProperties: false,
  },
}

function createNodeTreeKind(spy: ModuleKindSpy = {}): ModuleKind {
  const runner = (ctx: ModulePathContext, actionName: string, args: Readonly<Record<string, LlmJsonValue>>) => {
    spy.lastHost = ctx.host
    if (actionName === 'getNode') {
      const id = args['id']
      if (typeof id !== 'string' || id.length === 0) {
        return {
          ok: false,
          checks: [errorCheck('NODE_NOT_FOUND', 'id 为空', '先调 listChildren 取真实 id')],
        }
      }
      return okResult<LlmJsonValue>({ id, label: `node-${id}` })
    }
    return { ok: false, checks: [errorCheck('UNKNOWN_ACTION', `${actionName} 未实现`)] }
  }
  Object.assign(runner, { rootId: 'root-1' })
  return new ModuleKind({
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
        usageRules: ['只能在已知节点 id 时调用', '空 id 会返回 NODE_NOT_FOUND'],
        failureModes: [
          { code: 'NODE_NOT_FOUND', when: '指定 id 不存在', fix: '先调用 listChildren 取得真实 id' },
        ],
      },
    ],
    children: [],
    runner,
    list: (ctx) => {
      spy.lastHost = ctx.host
      return okResult<readonly ModuleInstanceRef[]>([])
    },
    find: (ctx) => {
      spy.lastHost = ctx.host
      const hostInstanceId = ctx.host?.moduleInstanceId
      if (hostInstanceId !== undefined && hostInstanceId.length > 0) {
        return okResult<readonly ModuleInstanceRef[]>([
          { id: hostInstanceId, label: '当前实例' },
        ])
      }
      return okResult<readonly ModuleInstanceRef[]>([
        { id: 'node-tree-1', label: '主页节点树' },
      ])
    },
  })
}

function createDefaultOnlyKind(): ModuleKind {
  return new ModuleKind({
    kind: 'default-only',
    name: '默认能力',
    description: '用于验证 ModuleKind 默认协议行为',
    attributes: [
      {
        name: 'title',
        description: '标题',
        schema: { type: 'string' },
        readable: true,
        writable: false,
      },
    ],
    actions: [
      {
        name: 'ping',
        description: '测试默认 action 未实现',
        paramsSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    ],
    children: [],
  })
}

function createRegisteredActionKind(): ModuleKind {
  return new ModuleKind({
    kind: 'registered-action',
    name: '注册动作',
    description: '用于验证 ModuleKind runner 函数',
    actions: [ECHO_ACTION_SCHEMA],
    runner: (_ctx, actionName, args) => {
      if (actionName !== ECHO_ACTION_SCHEMA.name) {
        return { ok: false, checks: [errorCheck('UNKNOWN_ACTION', `${actionName} 未实现`)] }
      }
      const value = args['value'] ?? null
      return okResult<LlmJsonValue>({
        value,
        tags: ['base-runner'],
      })
    },
  })
}

function createRuntime(): ModuleSemanticRuntime {
  const runtime = new ModuleSemanticRuntime()
  runtime.registerKind(createNodeTreeKind())
  return runtime
}

/** 测试用:取注册到 runtime 上的 spy,以观测 lastHost */
function createRuntimeWithSpy(): { runtime: ModuleSemanticRuntime; spy: ModuleKindSpy } {
  const runtime = new ModuleSemanticRuntime()
  const spy: ModuleKindSpy = {}
  runtime.registerKind(createNodeTreeKind(spy))
  return { runtime, spy }
}

// ═══════════════════════════════════════════════════════
// 测试用例
// ═══════════════════════════════════════════════════════

describe('ModuleSemanticRuntime.getLlmTools', () => {
  it('返回固定 6 个协议工具,名字稳定', () => {
    const tools = createRuntime().getLlmTools()
    const names = tools.map((spec) => spec.function.name)
    expect(names).toEqual([
      PROTOCOL_TOOL_NAMES.getAttribute,
      PROTOCOL_TOOL_NAMES.setAttribute,
      PROTOCOL_TOOL_NAMES.invokeAction,
      PROTOCOL_TOOL_NAMES.listChildren,
      PROTOCOL_TOOL_NAMES.findInstance,
      PROTOCOL_TOOL_NAMES.describeKind,
    ])
  })

  it('invokeAction 描述中带 rules / fails 数量标注(G3)', () => {
    const tools = createRuntime().getLlmTools()
    const invokeAction = tools.find((spec) => spec.function.name === PROTOCOL_TOOL_NAMES.invokeAction)
    expect(invokeAction).toBeDefined()
    if (invokeAction === undefined) throw new Error('not found')
    expect(invokeAction.function.description).toContain('rules=')
    expect(invokeAction.function.description).toContain('fails=')
  })

  it('parameters 字段是 JSON Schema object(收紧后)', () => {
    const tools = createRuntime().getLlmTools()
    for (const spec of tools) {
      expect(spec.function.parameters.type).toBe('object')
    }
  })

  it('通过 ModuleKind.runner 执行函数引用并投影 JSON', async () => {
    const runtime = new ModuleSemanticRuntime()
    runtime.registerKind(createRegisteredActionKind())

    const result = await runtime.executeTool('invokeAction', {
      path: '/registered-action[current]',
      actionName: 'echo',
      args: { value: 'hello' },
    })

    expect(result).toMatchObject({
      ok: true,
      data: {
        value: 'hello',
        tags: ['base-runner'],
      },
    })
  })
})

describe('ModuleSemanticRuntime.executeTool', () => {
  it('UNKNOWN_TOOL 时返回 ok=false 且 code 提示', async () => {
    const result = await createRuntime().executeTool('non-existent', {})
    expect(result.ok).toBe(false)
    expect(result.checks?.[0]?.code).toBe('UNKNOWN_TOOL')
  })

  it('getAttribute 走通(rootId)', async () => {
    const runtime = createRuntime()
    const result = await runtime.executeTool('getAttribute', {
      path: '/node-tree[t1]',
      attrName: 'rootId',
    })
    expect(result.ok).toBe(true)
    expect(result.data).toBe('root-1')
  })

  it('invokeAction 透传 args 并返回 ok=true', async () => {
    const runtime = createRuntime()
    const result = await runtime.executeTool('invokeAction', {
      path: '/node-tree[t1]',
      actionName: 'getNode',
      args: { id: 'n1' },
    })
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ id: 'n1', label: 'node-n1' })
  })

  it('invokeAction 参数校验失败时透传 INVALID_ARGS', async () => {
    const runtime = createRuntime()
    const result = await runtime.executeTool('invokeAction', {
      path: '/node-tree[t1]',
      actionName: 'getNode',
      args: {},
    })
    expect(result.ok).toBe(false)
    expect(result.checks?.[0]?.code).toMatch(/INVALID_ARGS|MISSING/i)
  })

  it('describeKind 输出 usageRules / failureModes(G1)', async () => {
    const runtime = createRuntime()
    const result = await runtime.executeTool('describeKind', { kind: 'node-tree' })
    expect(result.ok).toBe(true)
    const data = result.data
    if (!isRecord(data)) throw new Error('expected object payload')
    expect(data['kind']).toBe('node-tree')
    const actions = data['actions']
    if (!Array.isArray(actions) || actions.length === 0) {
      throw new Error('expected non-empty actions array')
    }
    const getNode = actions.find((a) => isRecord(a) && a['name'] === 'getNode')
    if (!isRecord(getNode)) throw new Error('getNode action missing')
    expect(getNode['usageRules']).toEqual(['只能在已知节点 id 时调用', '空 id 会返回 NODE_NOT_FOUND'])
    const failureModes = getNode['failureModes']
    if (!Array.isArray(failureModes) || failureModes.length === 0) {
      throw new Error('expected failureModes')
    }
    const first = failureModes[0]
    if (!isRecord(first)) throw new Error('failure mode shape')
    expect(first['code']).toBe('NODE_NOT_FOUND')
  })

  it('INVALID_PATH 时透传 ModulePathParseError code', async () => {
    const runtime = createRuntime()
    const result = await runtime.executeTool('getAttribute', {
      path: 'no-leading-slash',
      attrName: 'rootId',
    })
    expect(result.ok).toBe(false)
    expect(result.checks?.[0]?.code).toMatch(/^INVALID_PATH_/)
  })

  it('listChildren 根路径返回 kind 名单', async () => {
    const runtime = createRuntime()
    const result = await runtime.executeTool('listChildren', { path: '/' })
    expect(result.ok).toBe(true)
    const data = result.data
    if (!Array.isArray(data)) throw new Error('expected array')
    expect(data).toEqual([
      { id: 'node-tree', label: '节点树', summary: '页面节点树' },
    ])
  })

  it('findInstance 根路径下委托给目标 kind', async () => {
    const runtime = createRuntime()
    const result = await runtime.executeTool('findInstance', {
      path: '/',
      childKind: 'node-tree',
      query: { label: '主页' },
    })
    expect(result.ok).toBe(true)
    const data = result.data
    if (!Array.isArray(data) || data.length === 0) throw new Error('expected non-empty')
    if (!isRecord(data[0])) throw new Error('expected record')
    expect(data[0]['id']).toBe('node-tree-1')
  })
})

describe('ModuleSemanticRuntime 直接调用入口', () => {
  it('getAttribute 直接调用与 executeTool 等价', async () => {
    const runtime = createRuntime()
    const result = await runtime.getAttribute(ModulePath.parse('/node-tree[t1]'), 'rootId')
    expect(result.ok).toBe(true)
    expect(result.data).toBe('root-1')
  })

  it('describeKind 直接调用返回 attributes / actions / children', () => {
    const runtime = createRuntime()
    const result = runtime.describeKind('node-tree')
    expect(result.ok).toBe(true)
    expect(result.data?.kind).toBe('node-tree')
    expect(result.data?.attributes.map((attr) => attr.name)).toEqual(['rootId'])
    expect(result.data?.actions.map((action) => action.name)).toEqual(['getNode'])
  })
})

describe('ModuleKind 默认协议行为', () => {
  it('基类直接读写 runner 函数对象属性', async () => {
    const moduleKind = new ModuleKind({
      kind: 'runner-attrs',
      name: 'Runner 属性',
      description: '验证 getAttribute/setAttribute 基类实现',
      attributes: [
        {
          name: 'title',
          description: '标题',
          schema: { type: 'string' },
          readable: true,
          writable: true,
        },
      ],
    })
    const ctx: ModulePathContext = {
      segments: [{ kind: 'runner-attrs', id: 'root-1' }],
      segment: { kind: 'runner-attrs', id: 'root-1' },
    }

    await expect(moduleKind.setAttribute(ctx, 'title', '新标题')).resolves.toMatchObject({ ok: true })
    await expect(moduleKind.getAttribute(ctx, 'title')).resolves.toMatchObject({
      ok: true,
      data: '新标题',
    })
  })

  it('list/find ref 支持泛型收窄并保持 ModuleInstanceRef 协议约束', async () => {
    interface TypedRef extends ModuleInstanceRef {
      readonly source: 'typed'
    }

    const moduleKind = new ModuleKind<TypedRef>({
      kind: 'typed',
      name: '强类型实例',
      description: '验证 list/find 泛型约束',
      list: () => okResult<readonly TypedRef[]>([
        { id: 'typed-1', label: '强类型实例', source: 'typed' },
      ]),
      find: () => okResult<readonly TypedRef[]>([
        { id: 'typed-2', label: '强类型查询实例', source: 'typed' },
      ]),
    })
    const ctx: ModulePathContext = {
      segments: [{ kind: 'typed', id: 'root-1' }],
      segment: { kind: 'typed', id: 'root-1' },
    }

    await expect(moduleKind.listChildren(ctx)).resolves.toMatchObject({
      ok: true,
      data: [{ id: 'typed-1', label: '强类型实例', source: 'typed' }],
    })
    await expect(moduleKind.findInstance(ctx, 'typed', {})).resolves.toMatchObject({
      ok: true,
      data: [{ id: 'typed-2', label: '强类型查询实例', source: 'typed' }],
    })
  })

  it('基类统一实现 listChildren/findInstance/resolveChild, resolve 由 find/list 推导', async () => {
    const calls: string[] = []
    const moduleKind = new ModuleKind({
      kind: 'delegated',
      name: '委托模块',
      description: '验证基类协议入口',
      children: ['child'],
      list: (_ctx, childKind) => {
        calls.push(`list:${childKind ?? '*'}`)
        return okResult<readonly ModuleInstanceRef[]>([
          { id: 'listed-1', label: '子实例' },
        ])
      },
      find: (_ctx, childKind, query) => {
        calls.push(`find:${childKind}:${String(query['id'] ?? query['name'])}`)
        if (query['id'] === 'child-1') {
          return okResult<readonly ModuleInstanceRef[]>([
            { id: 'child-1', label: '路径子实例' },
          ])
        }
        return okResult<readonly ModuleInstanceRef[]>([
          { id: 'found-1', label: '查询实例' },
        ])
      },
    })
    const ctx: ModulePathContext = {
      segments: [{ kind: 'delegated', id: 'root-1' }],
      segment: { kind: 'delegated', id: 'root-1' },
    }

    await expect(moduleKind.listChildren(ctx, 'child')).resolves.toMatchObject({
      ok: true,
      data: [{ id: 'listed-1', label: '子实例' }],
    })
    await expect(moduleKind.findInstance(ctx, 'child', { name: 'demo' })).resolves.toMatchObject({
      ok: true,
      data: [{ id: 'found-1', label: '查询实例' }],
    })
    await expect(moduleKind.resolveChild(ctx, 'child', 'child-1')).resolves.toMatchObject({
      ok: true,
      data: true,
    })
    await expect(moduleKind.resolveChild(ctx, 'child', 'listed-1')).resolves.toMatchObject({
      ok: true,
      data: true,
    })
    expect(calls).toEqual(['list:child', 'find:child:demo', 'find:child:child-1', 'find:child:listed-1', 'list:child'])
  })

  it('默认完成无属性、无子节点、当前实例发现和未实现 action 响应', async () => {
    const runtime = new ModuleSemanticRuntime()
    runtime.registerKind(createDefaultOnlyKind())
    const host = {
      moduleId: 'demo',
      moduleInstanceId: 'instance-1',
      instanceId: 'demo:instance-1',
    }

    const found = await runtime.executeTool('findInstance', {
      path: '/',
      childKind: 'default-only',
      query: {},
    }, host)
    expect(found).toMatchObject({
      ok: true,
      data: [{ id: 'instance-1', label: '当前 default-only 实例' }],
    })

    const listed = await runtime.executeTool('listChildren', {
      path: '/default-only[instance-1]',
    }, host)
    expect(listed).toMatchObject({ ok: true, data: [] })

    const attr = await runtime.executeTool('getAttribute', {
      path: '/default-only[instance-1]',
      attrName: 'title',
    }, host)
    expect(attr).toMatchObject({
      ok: false,
      checks: [expect.objectContaining({ code: 'ATTRIBUTE_VALUE_NOT_FOUND' })],
    })

    const action = await runtime.executeTool('invokeAction', {
      path: '/default-only[instance-1]',
      actionName: 'ping',
      args: {},
    }, host)
    expect(action).toMatchObject({
      ok: false,
      checks: [expect.objectContaining({ code: 'ACTION_NOT_IMPLEMENTED' })],
    })
  })
})

describe('ModuleSemanticRuntime describeKind 完整 schema(plan 闭环 2)', () => {
  it('actions[].paramsSchema 透传(不为 additionalProperties:true)', async () => {
    const runtime = createRuntime()
    const result = await runtime.executeTool('describeKind', { kind: 'node-tree' })
    expect(result.ok).toBe(true)
    if (!isRecord(result.data)) throw new Error('expected object payload')
    const actions = result.data['actions']
    if (!Array.isArray(actions) || actions.length === 0) {
      throw new Error('expected non-empty actions array')
    }
    const getNode = actions.find((a) => isRecord(a) && a['name'] === 'getNode')
    if (!isRecord(getNode)) throw new Error('getNode action missing')
    const paramsSchema = getNode['paramsSchema']
    if (!isRecord(paramsSchema)) throw new Error('paramsSchema must be object payload')
    expect(paramsSchema['type']).toBe('object')
    expect(paramsSchema['additionalProperties']).toBe(false)
    expect(paramsSchema['required']).toEqual(['id'])
    const properties = paramsSchema['properties']
    if (!isRecord(properties)) throw new Error('properties must be object')
    expect(isRecord(properties['id']) && properties['id']['type']).toBe('string')
  })

  it('attributes[].schema 透传', async () => {
    const runtime = createRuntime()
    const result = await runtime.executeTool('describeKind', { kind: 'node-tree' })
    expect(result.ok).toBe(true)
    if (!isRecord(result.data)) throw new Error('expected object payload')
    const attributes = result.data['attributes']
    if (!Array.isArray(attributes) || attributes.length === 0) {
      throw new Error('expected non-empty attributes array')
    }
    const rootId = attributes[0]
    if (!isRecord(rootId)) throw new Error('attr shape')
    const schema = rootId['schema']
    if (!isRecord(schema)) throw new Error('schema must be object')
    expect(schema['type']).toBe('string')
  })
})

describe('ModuleSemanticRuntime host 作用域透传(plan 闭环 2)', () => {
  it('executeTool 第三参数 host 透传到 ModuleKind ctx.host', async () => {
    const { runtime, spy } = createRuntimeWithSpy()
    const host = { moduleId: 'page-design', moduleInstanceId: 'page-42', instanceId: 'session-1' }
    const result = await runtime.executeTool(
      'findInstance',
      { path: '/', childKind: 'node-tree', query: {} },
      host,
    )
    expect(result.ok).toBe(true)
    expect(spy.lastHost).toEqual(host)
    if (!Array.isArray(result.data) || result.data.length === 0) throw new Error('expected non-empty')
    const first = result.data[0]
    if (!isRecord(first)) throw new Error('expected record')
    expect(first['id']).toBe('page-42')
  })

  it('host 不传时 ctx.host === undefined,保持向后兼容', async () => {
    const { runtime, spy } = createRuntimeWithSpy()
    const result = await runtime.executeTool('findInstance', {
      path: '/',
      childKind: 'node-tree',
      query: {},
    })
    expect(result.ok).toBe(true)
    expect(spy.lastHost).toBeUndefined()
  })

  it('直接调用 findInstance 接受 host 形参并透传', async () => {
    const { runtime, spy } = createRuntimeWithSpy()
    const host = { moduleId: 'm', moduleInstanceId: 'i', instanceId: 's' }
    await runtime.findInstance(ModulePath.parse('/'), 'node-tree', {}, host)
    expect(spy.lastHost).toEqual(host)
  })

  it('非根路径 invokeAction 也透传 host', async () => {
    const { runtime, spy } = createRuntimeWithSpy()
    const host = { moduleId: 'm', moduleInstanceId: 'page-42', instanceId: 's' }
    const result = await runtime.executeTool(
      'invokeAction',
      { path: '/node-tree[page-42]', actionName: 'getNode', args: { id: 'n1' } },
      host,
    )
    expect(result.ok).toBe(true)
    expect(spy.lastHost).toEqual(host)
  })
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
