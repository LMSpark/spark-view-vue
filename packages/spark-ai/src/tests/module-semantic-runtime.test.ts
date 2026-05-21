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
  ModuleCapability,
  ModuleKindBase,
  ModuleSemanticRuntime,
  ModulePath,
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
// 测试用 Kind / Capability
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
          usageRules: ['只能在已知节点 id 时调用', '空 id 会返回 NODE_NOT_FOUND'],
          failureModes: [
            { code: 'NODE_NOT_FOUND', when: '指定 id 不存在', fix: '先调用 listChildren 取得真实 id' },
          ],
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

  public listChildren(
    _ctx: ModulePathContext,
    _childKind?: string,
  ): Promise<OperationResult<readonly ModuleInstanceRef[]>> {
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

function createRuntime(): ModuleSemanticRuntime {
  const runtime = new ModuleSemanticRuntime()
  runtime.registerKind(new NodeTreeKind())
  runtime.registerCapability(new NodeTreeCapability())
  return runtime
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

  it('findInstance 根路径下委托给目标 kind Capability', async () => {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
