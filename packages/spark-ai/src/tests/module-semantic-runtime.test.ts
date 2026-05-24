/**
 * 模块语义协议运行时测试。
 *
 * 覆盖范围:
 * - 工具规约固定包含 4 个知识入口与 6 个执行协议工具、含 usageRules / failureModes / parameters 收紧后的类型
 * - executeTool 路由到知识工具和 6 个执行协议工具(getAttribute / setAttribute / invokeAction /
 *   listChildren / findInstance / describeKind)
 * - 错误码:UNKNOWN_TOOL / INVALID_PATH_* / ACTION_NOT_DECLARED
 * - describeKind 返回 usageRules / failureModes(G1+G3 验证)
 */

import { describe, expect, it } from 'vitest'

import { isRecord } from '@spark-view/spark-utils'
import {
  ModuleCheckEntry,
  ModuleKind,
  ModuleOperationResult,
  ModulePath,
  ModuleParameterPayloadRegistry,
  ModuleSemanticRuntime,
  PROTOCOL_TOOL_NAMES,
  type ModuleInstanceRef,
  type ModuleActionMetadata,
  type ModuleParameterPayloadProvider,
  type ModuleSemanticKnowledgeSnapshot,
  type ModulePathContext,
} from '../module-semantic'
import type { ModuleSemanticKnowledgeSnapshot as RootModuleSemanticKnowledgeSnapshot } from '../index'
import type { LlmJsonValue } from '../schema'

type ModuleKindSpy = {
  lastHost?: ModulePathContext['host'] | undefined
}

const ECHO_ACTION_SCHEMA: ModuleActionMetadata = {
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
        return ModuleOperationResult.failCode('NODE_NOT_FOUND', 'id 为空', '先调 listChildren 取真实 id')
      }
      return ModuleOperationResult.ok<LlmJsonValue>({ id, label: `node-${id}` })
    }
    return ModuleOperationResult.failCode('UNKNOWN_ACTION', `${actionName} 未实现`)
  }
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
    attributeAccessor: {
      get: () => ModuleOperationResult.ok<unknown>('root-1'),
      set: () => ModuleOperationResult.failCode('ATTRIBUTE_NOT_WRITABLE', 'rootId is readonly'),
    },
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
    payloads: [
      {
        payloadRef: 'spark.component',
        description: 'SparkNode props 参数目录',
        requiredForActions: ['getNode'],
      },
    ],
    children: [],
    runner,
    list: (ctx) => {
      spy.lastHost = ctx.host
      return ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([])
    },
    find: (ctx) => {
      spy.lastHost = ctx.host
      const hostInstanceId = ctx.host?.moduleInstanceId
      if (hostInstanceId !== undefined && hostInstanceId.length > 0) {
        return ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([
          { id: hostInstanceId, label: '当前实例' },
        ])
      }
      return ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([
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
        return ModuleOperationResult.fail([ModuleCheckEntry.error('UNKNOWN_ACTION', `${actionName} 未实现`)])
      }
      const value = args['value'] ?? null
      return ModuleOperationResult.ok<LlmJsonValue>({
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
  it('返回固定知识工具和执行协议工具,名字稳定', () => {
    const tools = createRuntime().getLlmTools()
    const names = tools.map((spec) => spec.function.name)
    expect(names).toEqual([
      PROTOCOL_TOOL_NAMES.queryModules,
      PROTOCOL_TOOL_NAMES.queryFunctions,
      PROTOCOL_TOOL_NAMES.guideFunction,
      PROTOCOL_TOOL_NAMES.guideHumanQuestion,
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
    expect(invokeAction.function.description).toContain('payloads')
    expect(invokeAction.function.description).toContain('spark.component(actions=getNode)')
  })

  it('describeKind 工具说明显式暴露 payload 指南语义', () => {
    const tools = createRuntime().getLlmTools()
    const describeKind = tools.find((spec) => spec.function.name === PROTOCOL_TOOL_NAMES.describeKind)
    expect(describeKind).toBeDefined()
    if (describeKind === undefined) throw new Error('not found')
    expect(describeKind.function.description).toContain('payloads(外部参数指南引用)')
    expect(describeKind.function.description).toContain('requiredForActions')
  })

  it('knowledge 工具说明直面 LLM 并指向旧知识契约', () => {
    const tools = createRuntime().getLlmTools()
    const queryFunctions = tools.find((spec) => spec.function.name === PROTOCOL_TOOL_NAMES.queryFunctions)
    const guideFunction = tools.find((spec) => spec.function.name === PROTOCOL_TOOL_NAMES.guideFunction)
    const guideHumanQuestion = tools.find((spec) => spec.function.name === PROTOCOL_TOOL_NAMES.guideHumanQuestion)
    expect(queryFunctions?.function.description).toContain('旧 knowledge.queryFunctions')
    expect(guideFunction?.function.description).toContain('旧 knowledge.guideFunction')
    expect(guideFunction?.function.description).toContain('paramsSchema')
    expect(guideFunction?.function.parameters.oneOf).toEqual([
      { type: 'object', required: ['action'] },
      { type: 'object', required: ['kind', 'actionName'] },
    ])
    expect(guideHumanQuestion?.function.description).toContain('人工反问指南')
    expect(guideHumanQuestion?.function.parameters.required).toEqual(['context', 'reason'])
  })

  it('parameters 字段是 JSON Schema object(收紧后)', () => {
    const tools = createRuntime().getLlmTools()
    for (const spec of tools) {
      expect(spec.function.parameters.type).toBe('object')
    }
  })

  it('通过 ModuleKind 构造期 action 委托执行并投影 JSON', async () => {
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

  it('queryModules / queryFunctions 作为 LLM 直面工具返回知识摘要', async () => {
    const runtime = createRuntime()

    const modules = await runtime.executeTool('queryModules', {})
    expect(modules.ok).toBe(true)
    expect(modules.data).toEqual([
      expect.objectContaining({
        kind: 'node-tree',
        actionCount: 1,
        payloadRefs: ['spark.component'],
      }),
    ])

    const filteredModules = await runtime.executeTool('queryModules', { keyword: 'spark', parentKind: 'root' })
    expect(filteredModules.ok).toBe(true)
    expect(filteredModules.data).toEqual([
      expect.objectContaining({ kind: 'node-tree' }),
    ])

    const functions = await runtime.executeTool('queryFunctions', { keyword: 'getnode' })
    expect(functions.ok).toBe(true)
    expect(functions.data).toEqual([
      expect.objectContaining({
        action: 'node-tree.getNode',
        requiredParamNames: ['id'],
        failureCodes: ['NODE_NOT_FOUND'],
      }),
    ])
  })

  it('guideFunction 作为 LLM 直面工具返回完整调用指南和显式失败', async () => {
    const runtime = createRuntime()

    const guide = await runtime.executeTool('guideFunction', { action: 'node-tree.getNode' })
    expect(guide.ok).toBe(true)
    expect(guide.data).toMatchObject({
      action: 'node-tree.getNode',
      paramsSchema: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
      },
      usageRules: ['只能在已知节点 id 时调用', '空 id 会返回 NODE_NOT_FOUND'],
    })

    const invalid = await runtime.executeTool('guideFunction', { action: 'node-tree' })
    expect(invalid.ok).toBe(false)
    expect(invalid.checks?.[0]?.code).toBe('INVALID_GUIDE_REQUEST')
  })

  it('guideHumanQuestion 作为知识工具返回人工反问指南', async () => {
    const runtime = createRuntime()

    const guide = await runtime.executeTool('guideHumanQuestion', {
      context: '准备提交请假申请',
      reason: '缺少开始日期和结束日期,不能替用户猜测',
      missingFacts: ['请假开始日期', '请假结束日期'],
      candidateOptions: ['今天', '明天'],
    })

    expect(guide.ok).toBe(true)
    const data = guide.data
    if (!isRecord(data)) throw new Error('expected guide object')
    expect(data['shouldAskHuman']).toBe(true)
    expect(data['stopToolCalls']).toBe(true)
    expect(data['question']).toContain('请假开始日期')
    expect(data['question']).toContain('今天 / 明天')

    const invalid = await runtime.executeTool('guideHumanQuestion', {
      context: '',
      reason: '缺少确认',
    })
    expect(invalid.ok).toBe(false)
    expect(invalid.checks?.[0]?.code).toBe('INVALID_TOOL_ARGS')
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

  it('invokeAction 参数校验失败时由 ModuleKind 返回 SCHEMA_VALIDATION_FAILED', async () => {
    const runtime = createRuntime()
    const result = await runtime.executeTool('invokeAction', {
      path: '/node-tree[t1]',
      actionName: 'getNode',
      args: {},
    })
    expect(result.ok).toBe(false)
    expect(result.checks?.[0]?.code).toBe('SCHEMA_VALIDATION_FAILED')
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

  it('describeKind 直接调用返回 attributes / actions / payloads / children', () => {
    const runtime = createRuntime()
    const result = runtime.describeKind('node-tree')
    expect(result.ok).toBe(true)
    expect(result.data?.kind).toBe('node-tree')
    expect(result.data?.attributes.map((attr) => attr.name)).toEqual(['rootId'])
    expect(result.data?.actions.map((action) => action.name)).toEqual(['getNode'])
    expect(result.data?.payloads.map((payload) => payload.payloadRef)).toEqual(['spark.component'])
  })
})

describe('ModuleSemanticRuntime 知识投影', () => {
  it('不暴露 prompt 构造 helper 作为 Runtime 公共方法', () => {
    expect(Reflect.get(ModuleSemanticRuntime.prototype, 'buildKnowledgePromptSnapshot')).toBeUndefined()
  })

  it('投影模块目录、函数目录和系统提示词快照', () => {
    const runtime = createRuntime()
    const snapshot: ModuleSemanticKnowledgeSnapshot = runtime.projectKnowledge()
    const rootSnapshot: RootModuleSemanticKnowledgeSnapshot = runtime.projectKnowledge()

    expect(snapshot.modules).toEqual([
      {
        kind: 'node-tree',
        name: '节点树',
        description: '页面节点树',
        attributeCount: 1,
        actionCount: 1,
        payloadCount: 1,
        payloadRefs: ['spark.component'],
        childKindCount: 0,
        children: [],
      },
    ])
    expect(snapshot.functions).toEqual([
      {
        action: 'node-tree.getNode',
        kind: 'node-tree',
        actionName: 'getNode',
        description: '按 id 取节点',
        paramNames: ['id'],
        requiredParamNames: ['id'],
        failureCodes: ['NODE_NOT_FOUND'],
        usageRuleCount: 2,
        failureModeCount: 1,
      },
    ])
    expect(rootSnapshot.functions[0]?.action).toBe('node-tree.getNode')
    expect(snapshot.promptSnapshot).toContain('【AI Knowledge Snapshot】')
    expect(snapshot.promptSnapshot).toContain('不假设、不猜测')
    expect(snapshot.promptSnapshot).toContain('queryModules() -> queryFunctions')
    expect(snapshot.promptSnapshot).toContain('反问流程')
    expect(snapshot.promptSnapshot).toContain('listChildren("/") -> findInstance')
    expect(snapshot.promptSnapshot).toContain('node-tree.getNode')
    expect(snapshot.promptSnapshot).toContain('payloads=[spark.component]')
    expect(snapshot.promptSnapshot).toContain('payload 指南')
  })

  it('支持按 kind / keyword 查询函数摘要', () => {
    const runtime = createRuntime()

    expect(runtime.queryKnowledgeFunctions({ kind: 'node-tree' })).toHaveLength(1)
    expect(runtime.queryKnowledgeFunctions({ keyword: 'getnode' })).toEqual([
      expect.objectContaining({ action: 'node-tree.getNode' }),
    ])
    expect(runtime.queryKnowledgeFunctions({ kind: 'missing' })).toEqual([])
  })

  it('guideKnowledgeFunction 返回完整动作指南,失败时显式诊断', () => {
    const runtime = createRuntime()

    const guide = runtime.guideKnowledgeFunction({ action: 'node-tree.getNode' })
    expect(guide.ok).toBe(true)
    expect(guide.data).toMatchObject({
      action: 'node-tree.getNode',
      kind: 'node-tree',
      actionName: 'getNode',
      description: '按 id 取节点',
      paramsSchema: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
      },
      usageRules: ['只能在已知节点 id 时调用', '空 id 会返回 NODE_NOT_FOUND'],
      failureModes: [
        { code: 'NODE_NOT_FOUND', when: '指定 id 不存在', fix: '先调用 listChildren 取得真实 id' },
      ],
    })

    const missing = runtime.guideKnowledgeFunction({ action: 'node-tree.missing' })
    expect(missing.ok).toBe(false)
    expect(missing.checks?.[0]?.code).toBe('FUNCTION_NOT_FOUND')
  })
})

describe('ModuleParameterPayloadRegistry', () => {
  it('按 moduleKind + payloadRef 注册参数 provider，重复注册 fail-fast', () => {
    const registry = new ModuleParameterPayloadRegistry()
    const provider: ModuleParameterPayloadProvider = {
      moduleKind: 'node-tree',
      payloadRef: 'spark.component',
      description: '组件参数',
      queryPayloads: () => [
        {
          moduleKind: 'node-tree',
          payloadRef: 'spark.component',
          key: 'r-button',
          description: '按钮',
        },
      ],
      guidePayload: (key: string) => key === 'r-button'
        ? {
            moduleKind: 'node-tree',
            payloadRef: 'spark.component',
            key,
            description: '按钮参数',
            paramsSchema: {
              type: 'object',
              properties: {
                label: { type: 'string' },
              },
              additionalProperties: true,
            },
          }
        : null,
    }

    registry.register(provider)

    expect(registry.queryPayloads({ moduleKind: 'node-tree', payloadRef: 'spark.component' })).toEqual([
      expect.objectContaining({ key: 'r-button' }),
    ])
    expect(registry.guidePayload('node-tree', 'spark.component', 'r-button')).toMatchObject({
      key: 'r-button',
      paramsSchema: { type: 'object' },
    })
    expect(() => registry.register(provider)).toThrow('Duplicate module parameter payload provider')
    expect(() => registry.queryPayloads({ moduleKind: 'dataset' })).toThrow('No parameter payload provider registered for moduleKind: dataset')
  })
})

describe('ModuleKind 默认协议行为', () => {
  it('parentKind 让根发现只返回根模块,describeKind 保留父子拓扑', async () => {
    const runtime = new ModuleSemanticRuntime()
    runtime.registerKind(new ModuleKind({
      kind: 'root-kind',
      name: '根模块',
      description: '根模块描述',
      children: ['child-kind'],
    }))
    runtime.registerKind(new ModuleKind({
      kind: 'child-kind',
      name: '子模块',
      description: '子模块描述',
      parentKind: 'root-kind',
    }))

    const listed = await runtime.executeTool('listChildren', { path: '/' })
    expect(listed).toMatchObject({
      ok: true,
      data: [{ id: 'root-kind', label: '根模块', summary: '根模块描述' }],
    })

    const root = await runtime.executeTool('describeKind', { kind: 'root-kind' })
    expect(root).toMatchObject({
      ok: true,
      data: expect.objectContaining({ children: ['child-kind'] }),
    })
    const child = await runtime.executeTool('describeKind', { kind: 'child-kind' })
    expect(child).toMatchObject({
      ok: true,
      data: expect.objectContaining({ parentKind: 'root-kind' }),
    })
  })

  it('主字段、属性委托、children 和 parentKind 声明错误时 fail-fast', () => {
    expect(() => new ModuleKind({
      kind: ' ',
      name: 'Invalid Kind',
      description: 'invalid',
    })).toThrow('kind must not be empty')

    expect(() => new ModuleKind({
      kind: 'missing-attr-accessor',
      name: 'Missing Attr Accessor',
      description: 'invalid',
      attributes: [
        {
          name: 'title',
          description: '标题',
          schema: { type: 'string' },
          readable: true,
          writable: true,
        },
      ],
    })).toThrow('attributeAccessor for "missing-attr-accessor" is required when attributes are declared')

    expect(() => new ModuleKind({
      kind: 'invalid-parent',
      name: 'Invalid Parent',
      description: 'invalid',
      parentKind: 'invalid-parent',
    })).toThrow('parentKind for "invalid-parent" must not point to itself')

    expect(() => new ModuleKind({
      kind: 'invalid-child',
      name: 'Invalid Child',
      description: 'invalid',
      children: ['child', ' child '],
    })).toThrow('duplicate child kind "child" on "invalid-child"')

    expect(() => new ModuleKind({
      kind: 'invalid-payload',
      name: 'Invalid Payload',
      description: 'invalid',
      payloads: [
        { payloadRef: 'spark.component', description: '组件参数' },
        { payloadRef: ' spark.component ', description: '重复组件参数' },
      ],
    })).toThrow('duplicate payloadRef "spark.component" on "invalid-payload"')
  })

  it('基类通过独立 attributeAccessor 读写属性并按 schema 校验', async () => {
    let title: unknown
    const moduleKind = new ModuleKind({
      kind: 'accessor-attrs',
      name: 'Accessor 属性',
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
      attributeAccessor: {
        get: () => ModuleOperationResult.ok<unknown>(title),
        set: (_ctx, _attrName, value) => {
          title = value
          return ModuleOperationResult.ok<void>()
        },
      },
    })
    const ctx: ModulePathContext = {
      segments: [{ kind: 'accessor-attrs', id: 'root-1' }],
      segment: { kind: 'accessor-attrs', id: 'root-1' },
    }

    await expect(moduleKind.setAttribute(ctx, 'title', '新标题')).resolves.toMatchObject({ ok: true })
    await expect(moduleKind.getAttribute(ctx, 'title')).resolves.toMatchObject({
      ok: true,
      data: '新标题',
    })
    const invalid = await moduleKind.setAttribute(ctx, 'title', 123)
    expect(invalid.ok).toBe(false)
    expect(invalid.checks?.[0]?.code).toBe('SCHEMA_VALIDATION_FAILED')
  })

  it('listChildren/findInstance ref 保持 ModuleInstanceRef 协议约束', async () => {
    const moduleKind = new ModuleKind({
      kind: 'typed',
      name: '强类型实例',
      description: '验证 list/find 协议约束',
      list: () => ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([
        { id: 'typed-1', label: '强类型实例' },
      ]),
      find: () => ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([
        { id: 'typed-2', label: '强类型查询实例' },
      ]),
    })
    const ctx: ModulePathContext = {
      segments: [{ kind: 'typed', id: 'root-1' }],
      segment: { kind: 'typed', id: 'root-1' },
    }

    await expect(moduleKind.listChildren(ctx)).resolves.toMatchObject({
      ok: true,
      data: [{ id: 'typed-1', label: '强类型实例' }],
    })
    await expect(moduleKind.findInstance(ctx, 'typed', {})).resolves.toMatchObject({
      ok: true,
      data: [{ id: 'typed-2', label: '强类型查询实例' }],
    })
  })

  it('基类统一实现 listChildren/findInstance/resolveChild, resolveChild 以 find 结果为准', async () => {
    const calls: string[] = []
    const moduleKind = new ModuleKind({
      kind: 'delegated',
      name: '委托模块',
      description: '验证基类协议入口',
      children: ['child'],
      list: (_ctx, childKind) => {
        calls.push(`list:${childKind ?? '*'}`)
        return ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([
          { id: 'listed-1', label: '子实例' },
        ])
      },
      find: (_ctx, childKind, query) => {
        calls.push(`find:${childKind}:${String(query['id'] ?? query['name'])}`)
        if (query['id'] === 'child-1') {
          return ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([
            { id: 'child-1', label: '路径子实例' },
          ])
        }
        return ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([
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
      data: false,
    })
    expect(calls).toEqual(['list:child', 'find:child:demo', 'find:child:child-1', 'find:child:listed-1'])
  })

  it('构造期委托不作为 runner/list/find 公共字段暴露', () => {
    const moduleKind = createRegisteredActionKind()
    expect(Reflect.get(moduleKind, 'runner')).toBeUndefined()
    expect(Reflect.get(moduleKind, 'list')).toBeUndefined()
    expect(Reflect.get(moduleKind, 'find')).toBeUndefined()
  })

  it('直接调用 invokeAction 也执行 paramsSchema 校验', async () => {
    const moduleKind = createRegisteredActionKind()
    const ctx: ModulePathContext = {
      segments: [{ kind: 'registered-action', id: 'current' }],
      segment: { kind: 'registered-action', id: 'current' },
    }

    const result = await moduleKind.invokeAction(ctx, 'echo', { value: 123 })
    expect(result.ok).toBe(false)
    expect(result.checks?.[0]?.code).toBe('SCHEMA_VALIDATION_FAILED')
  })

  it('coerceJsonValue 处理循环引用、特殊数值和常见运行时对象', () => {
    const circular: {
      self?: unknown
      date?: unknown
      badNumber?: unknown
      big?: unknown
      symbolValue?: unknown
      bytes?: unknown
    } = {
      date: new Date('2026-05-23T00:00:00.000Z'),
      badNumber: Number.NaN,
      big: 123n,
      symbolValue: Symbol('demo'),
      bytes: new Uint8Array([1, 2, 3]),
    }
    circular.self = circular

    const coerced = ModuleKind.coerceJsonValue(circular)
    if (!isRecord(coerced)) throw new Error('expected record')

    expect(coerced['date']).toBe('2026-05-23T00:00:00.000Z')
    expect(coerced['badNumber']).toBeUndefined()
    expect(coerced['big']).toBe('123')
    expect(coerced['symbolValue']).toBe('Symbol(demo)')
    expect(coerced['bytes']).toEqual([1, 2, 3])
    expect(coerced['self']).toBeUndefined()
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
      checks: [expect.objectContaining({ code: 'ATTRIBUTE_NOT_DECLARED' })],
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
