/**
 * 模块语义协议运行时测试。
 *
 * 覆盖范围:
 * - 工具规约固定包含 4 个知识入口与 6 个执行协议工具、含 usageRules / failureModes / parameters 收紧后的类型
 * - executeTool 路由到知识工具和固定协议工具(getAttribute / setAttribute / listChildren /
 *   findInstance / describeKind)，以及动态业务函数工具(&lt;kind&gt;_&lt;fn&gt;)
 * - 错误码:UNKNOWN_TOOL / INVALID_PATH_* / FUNCTION_NOT_DECLARED
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
  type ModuleFunctionMetadata,
  type ModuleParameterPayloadProvider,
  type ModuleSemanticKnowledgeSnapshot,
  type ModulePathContext,
} from '../module-semantic'
import type { ModuleSemanticKnowledgeSnapshot as RootModuleSemanticKnowledgeSnapshot } from '../index'
import type { LlmJsonValue } from '../schema'

type ModuleKindSpy = {
  lastHost?: ModulePathContext['host']
}

const ECHO_FUNCTION_SCHEMA: ModuleFunctionMetadata = {
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
        requiredForFunctions: ['getNode'],
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
    functions: [
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
    functions: [ECHO_FUNCTION_SCHEMA],
    runner: (_ctx, actionName, args) => {
      if (actionName !== ECHO_FUNCTION_SCHEMA.name) {
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

const NODE_TREE_PAYLOAD_LOOKUP_STEPS = [
  '先定位 payload 目录模块 payload-catalog(业务目录模块); 没有实例路径时用 listChildren/findInstance 获取目录实例。',
  '先调用 payload-catalog_queryPayloads({ $paths: [<catalogInstanceId>], moduleKind: "node-tree", payloadRef: "spark.component", keyword/category/key, limit }) 查询目录并选择真实 key。',
  '再调用 payload-catalog_guidePayload({ $paths: [<catalogInstanceId>], moduleKind: "node-tree", payloadRef: "spark.component", key }) 读取 paramsSchema、usageRules 和 failureModes。',
  '最后才调用 node-tree_getNode; 复杂参数只能按 guidePayload 返回的 schema 字段构造。',
] as const

const NODE_TREE_FUNCTION_LOOKUP_STEPS = [
  '先调用 queryFunctions({ kind: "node-tree", keyword: "getNode" }) 查函数目录，确认 functionName、必填参数和 failureCodes。',
  '再调用 guideFunction({ toolName: "node-tree_getNode" }) 读取完整 paramsSchema、usageRules 和 failureModes。',
  '随后调用 node-tree_getNode({ $paths: [...] }) 执行业务函数。',
] as const

const NODE_TREE_MODULE_PAYLOAD_LOOKUP_STEPS = [
  ...NODE_TREE_PAYLOAD_LOOKUP_STEPS.slice(0, 3),
  '最后才调用 <toolName>; 复杂参数只能按 guidePayload 返回的 schema 字段构造。',
] as const

const NODE_TREE_INSTANCE_GUIDE = {
  refShape: '{ id: string, label: string, summary?: string }',
  pathPattern: '/node-tree[<node-treeId>]',
  discoveryScope: 'root',
  queryFields: ['id', 'label', 'keyword', 'hint', 'rootId'],
  queryExamples: [
    { id: '<instanceId>' },
    { label: '<显示名>' },
    { keyword: '<关键词>' },
    { rootId: '<rootId>' },
  ],
  discoverySteps: [
    'listChildren("/") 查看根级 kind。',
    'findInstance("/", "node-tree", query) 获取 node-tree 实例 id。',
  ],
  pathBuildSteps: [
    '从 findInstance("/", "node-tree", query) 返回的 ModuleInstanceRef.id 取实例 id。',
    '拼接实例路径 /node-tree[<instanceRef.id>]。',
  ],
  operationSteps: [
    '用实例 path 调用 describeKind("node-tree") 读取元数据。',
    '属性读写复用同一个实例 path：getAttribute/setAttribute。',
    '函数调用复用同一个实例 path：标准 function tool。',
    '进入子 kind 时，以当前实例 path 作为 parentPath 调用 listChildren/findInstance。',
  ],
} as const

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
      PROTOCOL_TOOL_NAMES.listChildren,
      PROTOCOL_TOOL_NAMES.findInstance,
      PROTOCOL_TOOL_NAMES.describeKind,
      'node-tree_getNode',
    ])
  })

  it('固定工具说明只写协议职责,不内嵌业务 action 摘要', () => {
    const tools = createRuntime().getLlmTools()
    for (const tool of tools) {
      expect(tool.function.description).toContain('职责：')
      expect(tool.function.description).toContain('何时使用：')
      expect(tool.function.description).not.toContain('当前注册的 kind')
      expect(tool.function.description).not.toContain('rules=')
      expect(tool.function.description).not.toContain('fails=')
    }

    const businessFn = tools.find((spec) => spec.function.name === 'node-tree_getNode')
    expect(businessFn).toBeDefined()
    if (businessFn === undefined) throw new Error('not found')
    expect(businessFn.function.description).toContain('queryFunctions/guideFunction/describeKind')
    expect(businessFn.function.description).toContain('payloadLookupSteps')
    expect(businessFn.function.description).not.toContain('spark.component(functions=getNode)')
  })

  it('describeKind 工具说明显式暴露 payload 指南语义', () => {
    const tools = createRuntime().getLlmTools()
    const describeKind = tools.find((spec) => spec.function.name === PROTOCOL_TOOL_NAMES.describeKind)
    expect(describeKind).toBeDefined()
    if (describeKind === undefined) throw new Error('not found')
    expect(describeKind.function.description).toContain('attributes(readable/writable/schema)')
    expect(describeKind.function.description).toContain('requiredForFunctions')
  })

  it('知识工具说明清楚区分目录、函数指南和人工反问', () => {
    const tools = createRuntime().getLlmTools()
    const queryModules = tools.find((spec) => spec.function.name === PROTOCOL_TOOL_NAMES.queryModules)
    const queryFunctions = tools.find((spec) => spec.function.name === PROTOCOL_TOOL_NAMES.queryFunctions)
    const guideFunction = tools.find((spec) => spec.function.name === PROTOCOL_TOOL_NAMES.guideFunction)
    const guideHumanQuestion = tools.find((spec) => spec.function.name === PROTOCOL_TOOL_NAMES.guideHumanQuestion)
    expect(queryModules?.function.description).toContain('ModuleKind 分层知识目录')
    expect(queryModules?.function.description).toContain('instanceGuide.queryFields')
    expect(queryModules?.function.description).toContain('childKindSummaries')
    expect(queryModules?.function.description).toContain('detailLookupSteps')
    expect(queryFunctions?.function.description).toContain('函数目录')
    expect(queryFunctions?.function.description).toContain('guideFunction')
    expect(guideFunction?.function.description).toContain('完整调用契约')
    expect(guideFunction?.function.description).toContain('paramsSchema')
    expect(guideFunction?.function.description).toContain('payloadLookupSteps')
    expect(guideFunction?.function.parameters.oneOf).toEqual([
      { type: 'object', required: ['toolName'] },
      { type: 'object', required: ['kind', 'functionName'] },
    ])
    expect(guideHumanQuestion?.function.description).toContain('缺失用户事实')
    expect(guideHumanQuestion?.function.parameters.required).toEqual(['context', 'reason'])
  })

  it('parameters 字段是 JSON Schema object(收紧后)', () => {
    const tools = createRuntime().getLlmTools()
    for (const spec of tools) {
      expect(spec.function.parameters.type).toBe('object')
    }
  })

  it('通过 ModuleKind 构造期 function 委托执行并投影 JSON', async () => {
    const runtime = new ModuleSemanticRuntime()
    runtime.registerKind(createRegisteredActionKind())

    const result = await runtime.executeTool('registered-action_echo', {
      $paths: ['current'],
      value: 'hello',
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
        functionCount: 1,
        payloadRefs: ['spark.component'],
        pathPattern: '/node-tree[<node-treeId>]',
        instanceGuide: expect.objectContaining({
          queryFields: ['id', 'label', 'keyword', 'hint', 'rootId'],
        }),
        attributeGuides: [
          expect.objectContaining({ name: 'rootId', access: 'read' }),
        ],
        functionGuides: [
          expect.objectContaining({ toolName: 'node-tree_getNode' }),
        ],
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
        toolName: 'node-tree_getNode',
        requiredParamNames: ['id'],
        failureCodes: ['NODE_NOT_FOUND'],
      }),
    ])
  })

  it('guideFunction 作为 LLM 直面工具返回完整调用指南和显式失败', async () => {
    const runtime = createRuntime()

    const guide = await runtime.executeTool('guideFunction', { toolName: 'node-tree_getNode' })
    expect(guide.ok).toBe(true)
    expect(guide.data).toMatchObject({
      toolName: 'node-tree_getNode',
      paramsSchema: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
      },
      usageRules: ['只能在已知节点 id 时调用', '空 id 会返回 NODE_NOT_FOUND'],
    })

    const invalid = await runtime.executeTool('guideFunction', { toolName: 'node-tree' })
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

  it('node-tree_getNode 透传参数并返回 ok=true', async () => {
    const runtime = createRuntime()
    const result = await runtime.executeTool('node-tree_getNode', {
      $paths: ['t1'],
      id: 'n1',
    })
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ id: 'n1', label: 'node-n1' })
  })

  it('node-tree_getNode 参数校验失败时由 ModuleKind 返回 SCHEMA_VALIDATION_FAILED', async () => {
    const runtime = createRuntime()
    const result = await runtime.executeTool('node-tree_getNode', {
      $paths: ['t1'],
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
    const functions = data['functions']
    if (!Array.isArray(functions) || functions.length === 0) {
      throw new Error('expected non-empty functions array')
    }
    const getNode = functions.find((a) => isRecord(a) && a['name'] === 'getNode')
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

  it('describeKind 直接调用返回 attributes / functions / payloads / children', () => {
    const runtime = createRuntime()
    const result = runtime.describeKind('node-tree')
    expect(result.ok).toBe(true)
    expect(result.data?.kind).toBe('node-tree')
    expect(result.data?.attributes.map((attr) => attr.name)).toEqual(['rootId'])
    expect(result.data?.functions.map((fn) => fn.name)).toEqual(['getNode'])
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
      expect.objectContaining({
        kind: 'node-tree',
        name: '节点树',
        description: '页面节点树',
        attributeCount: 1,
        attributeNames: ['rootId'],
        readableAttributeNames: ['rootId'],
        writableAttributeNames: [],
        functionCount: 1,
        functionNames: ['getNode'],
        payloadCount: 1,
        payloadRefs: ['spark.component'],
        payloadFunctionRefs: ['spark.component(functions=getNode)'],
        payloadLookupSteps: NODE_TREE_MODULE_PAYLOAD_LOOKUP_STEPS,
        childKindCount: 0,
        children: [],
        level: 0,
        pathPattern: '/node-tree[<node-treeId>]',
        instanceGuide: NODE_TREE_INSTANCE_GUIDE,
        instanceLookupSteps: [
          'listChildren("/") 查看根级 kind。',
          'findInstance("/", "node-tree", query) 获取 node-tree 实例 id。',
        ],
        childLookupSteps: [],
        attributeLookupSteps: [
          'describeKind("node-tree") 查看 attributes 的 schema、readable 和 writable。',
          '读取属性使用 getAttribute({ path, attrName })。',
          '写入属性使用 setAttribute({ path, attrName, value })。',
        ],
        functionLookupSteps: [
          'queryFunctions({ kind: "node-tree" }) 查看 node-tree 函数目录。',
          'guideFunction({ toolName: "node-tree_<functionName>" }) 查看单个函数 paramsSchema、usageRules 和 failureModes。',
          '<toolName>({ $paths: [<node-treeId>] }) 执行业务函数。',
        ],
        attributeGuides: [
          {
            name: 'rootId',
            description: '根节点 id',
            access: 'read',
            readable: true,
            writable: false,
            schemaLookupStep: 'describeKind("node-tree").attributes["rootId"].schema',
            readStep: 'getAttribute({ path, attrName: "rootId" })',
          },
        ],
        functionGuides: [
          expect.objectContaining({
            toolName: 'node-tree_getNode',
            kindPath: ['node-tree'],
            functionName: 'getNode',
            lookupSteps: NODE_TREE_FUNCTION_LOOKUP_STEPS,
            invokeStep: 'node-tree_getNode({ $paths: [<node-treeId>] })',
            payloadRefs: ['spark.component'],
          }),
        ],
        childKindSummaries: [],
      }),
    ])
    expect(snapshot.functions).toEqual([
      {
        toolName: 'node-tree_getNode',
        kindPath: ['node-tree'],
        kind: 'node-tree',
        functionName: 'getNode',
        description: '按 id 取节点',
        paramNames: ['id'],
        requiredParamNames: ['id'],
        failureCodes: ['NODE_NOT_FOUND'],
        usageRuleCount: 2,
        failureModeCount: 1,
        functionLookupSteps: NODE_TREE_FUNCTION_LOOKUP_STEPS,
        payloadRefs: ['spark.component'],
        requiresPayloadGuide: true,
        payloadLookupSteps: NODE_TREE_PAYLOAD_LOOKUP_STEPS,
      },
    ])
    expect(rootSnapshot.functions[0]?.toolName).toBe('node-tree_getNode')
    expect(snapshot.kindLayers).toEqual([
      expect.objectContaining({
        kind: 'node-tree',
        name: '节点树',
        level: 0,
        pathPattern: '/node-tree[<node-treeId>]',
        instanceGuide: NODE_TREE_INSTANCE_GUIDE,
        instanceLookupSteps: [
          'listChildren("/") 查看根级 kind。',
          'findInstance("/", "node-tree", query) 获取 node-tree 实例 id。',
        ],
        childLookupSteps: [],
        attributeLookupSteps: [
          'describeKind("node-tree") 查看 attributes 的 schema、readable 和 writable。',
          '读取属性使用 getAttribute({ path, attrName })。',
          '写入属性使用 setAttribute({ path, attrName, value })。',
        ],
        functionLookupSteps: [
          'queryFunctions({ kind: "node-tree" }) 查看 node-tree 函数目录。',
          'guideFunction({ toolName: "node-tree_<functionName>" }) 查看单个函数 paramsSchema、usageRules 和 failureModes。',
          '<toolName>({ $paths: [<node-treeId>] }) 执行业务函数。',
        ],
        payloadLookupSteps: NODE_TREE_MODULE_PAYLOAD_LOOKUP_STEPS,
        attributes: [
          {
            name: 'rootId',
            description: '根节点 id',
            access: 'read',
            readable: true,
            writable: false,
            schemaLookupStep: 'describeKind("node-tree").attributes["rootId"].schema',
            readStep: 'getAttribute({ path, attrName: "rootId" })',
          },
        ],
        functions: [
          expect.objectContaining({
            toolName: 'node-tree_getNode',
            kindPath: ['node-tree'],
            functionName: 'getNode',
            lookupSteps: NODE_TREE_FUNCTION_LOOKUP_STEPS,
            invokeStep: 'node-tree_getNode({ $paths: [<node-treeId>] })',
            payloadRefs: ['spark.component'],
          }),
        ],
        childKinds: [],
      }),
    ])
    expect(snapshot.promptSnapshot).not.toContain('【AI Knowledge Snapshot】')
    expect(snapshot.promptSnapshot).toContain('工具：')
    expect(snapshot.promptSnapshot).toContain('知识=queryModules/queryFunctions/guideFunction')
    expect(snapshot.promptSnapshot).toContain('实例=listChildren/findInstance')
    expect(snapshot.promptSnapshot).not.toContain('1. queryModules({ kind?: string')
    expect(snapshot.promptSnapshot).not.toContain('10. guideHumanQuestion({ context: string')
    expect(snapshot.promptSnapshot).toContain('root node-tree; payload=payload-catalog')
    expect(snapshot.promptSnapshot).toContain('流程：实例->schema/元数据->执行')
    expect(snapshot.promptSnapshot).not.toContain('函数目录摘要')
    expect(snapshot.promptSnapshot).not.toContain('node-tree.getNode:')
    expect(snapshot.promptSnapshot).not.toContain('required=[componentId]')
  })

  it('父层 queryModules 摘要包含子 kind 的功能摘要和下一跳', () => {
    const runtime = new ModuleSemanticRuntime()
    runtime.registerKind(new ModuleKind({
      kind: 'leave-root',
      name: '请假单据',
      description: '请假单据根模块。',
      children: ['leave-person'],
    }))
    runtime.registerKind(new ModuleKind({
      kind: 'leave-person',
      name: '人员目录',
      description: '可选人员实例目录。',
      parentKind: 'leave-root',
      attributes: [
        {
          name: 'code',
          description: '人员编码。',
          schema: { type: 'string' },
          readable: true,
          writable: false,
        },
        {
          name: 'name',
          description: '人员姓名。',
          schema: { type: 'string' },
          readable: true,
          writable: false,
        },
      ],
      attributeAccessor: {
        get: (ctx, attrName) => ModuleOperationResult.ok(attrName === 'code' ? (ctx.segment?.id ?? '') : 'Ada'),
        set: () => ModuleOperationResult.failCode('READONLY', '人员目录只读。'),
      },
      functions: [
        {
          name: 'selectPerson',
          description: '按人员编码选择人员。',
          paramsSchema: {
            type: 'object',
            properties: {
              code: { type: 'string' },
            },
            required: ['code'],
            additionalProperties: false,
          },
        },
      ],
    }))

    const summaries = runtime.queryKnowledgeModules({ keyword: '人员编码' })
    expect(summaries.map((summary) => summary.kind)).toEqual(['leave-root', 'leave-person'])
    const root = summaries[0]
    const child = summaries[1]
    expect(root?.childKindSummaries).toEqual([
      expect.objectContaining({
        kind: 'leave-person',
        attributeNames: ['code', 'name'],
        functionNames: ['selectPerson'],
        attributeSummaries: expect.arrayContaining([
          expect.objectContaining({
            name: 'code',
            description: '人员编码。',
            access: 'read',
          }),
        ]),
        functionSummaries: expect.arrayContaining([
          expect.objectContaining({
            functionName: 'selectPerson',
            description: '按人员编码选择人员。',
            requiredParamNames: ['code'],
          }),
        ]),
        detailLookupSteps: [
          'queryModules({ kind: "leave-person" }) 读取 leave-person 自己的 instanceGuide、attributeGuides 和 functionGuides。',
          'describeKind("leave-person") 查看 leave-person 的 attributes/functions/payloads/children 元数据。',
          '在父实例 path 下 listChildren/findInstance(path, "leave-person", query) 定位子实例。',
        ],
      }),
    ])
    expect(child).toMatchObject({
      kind: 'leave-person',
      level: 1,
      instanceGuide: expect.objectContaining({
        discoveryScope: 'parent',
        queryFields: ['id', 'label', 'keyword', 'hint', 'code', 'name'],
      }),
      instanceLookupSteps: [
        '先获得父路径 /leave-root[<parentId>]。',
        'listChildren(parentPath, "leave-person") 查看 leave-person 子实例。',
        'findInstance(parentPath, "leave-person", query) 获取 leave-person 实例 id。',
      ],
    })
  })

  it('支持按 kind / keyword 查询函数摘要', () => {
    const runtime = createRuntime()

    expect(runtime.queryKnowledgeFunctions({ kind: 'node-tree' })).toHaveLength(1)
    expect(runtime.queryKnowledgeFunctions({ keyword: 'getnode' })).toEqual([
      expect.objectContaining({ toolName: 'node-tree_getNode' }),
    ])
    expect(runtime.queryKnowledgeFunctions({ kind: 'missing' })).toEqual([])
  })

  it('guideKnowledgeFunction 返回完整动作指南,失败时显式诊断', () => {
    const runtime = createRuntime()

    const guide = runtime.guideKnowledgeFunction({ toolName: 'node-tree_getNode' })
    expect(guide.ok).toBe(true)
    expect(guide.data).toMatchObject({
      toolName: 'node-tree_getNode',
      kind: 'node-tree',
      functionName: 'getNode',
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
      functionLookupSteps: NODE_TREE_FUNCTION_LOOKUP_STEPS,
      payloadRefs: ['spark.component'],
      requiresPayloadGuide: true,
      payloadLookupSteps: NODE_TREE_PAYLOAD_LOOKUP_STEPS,
    })

    const missing = runtime.guideKnowledgeFunction({ toolName: 'node-tree_missing' })
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

  it('直接调用 invokeFunction 也执行 paramsSchema 校验', async () => {
    const moduleKind = createRegisteredActionKind()
    const ctx: ModulePathContext = {
      segments: [{ kind: 'registered-action', id: 'current' }],
      segment: { kind: 'registered-action', id: 'current' },
    }

    const result = await moduleKind.invokeFunction(ctx, 'echo', { value: 123 })
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

    const action = await runtime.executeTool('default-only_ping', {
      $paths: ['instance-1'],
    }, host)
    expect(action).toMatchObject({
      ok: false,
      checks: [expect.objectContaining({ code: 'FUNCTION_NOT_IMPLEMENTED' })],
    })
  })
})

describe('ModuleSemanticRuntime describeKind 完整 schema(plan 闭环 2)', () => {
  it('actions[].paramsSchema 透传(不为 additionalProperties:true)', async () => {
    const runtime = createRuntime()
    const result = await runtime.executeTool('describeKind', { kind: 'node-tree' })
    expect(result.ok).toBe(true)
    if (!isRecord(result.data)) throw new Error('expected object payload')
    const functions = result.data['functions']
    if (!Array.isArray(functions) || functions.length === 0) {
      throw new Error('expected non-empty functions array')
    }
    const getNode = functions.find((a) => isRecord(a) && a['name'] === 'getNode')
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
    await runtime.findInstance({
      path: ModulePath.parse('/'),
      childKind: 'node-tree',
      query: {},
      host,
    })
    expect(spy.lastHost).toEqual(host)
  })

  it('非根路径 business function tool 也透传 host', async () => {
    const { runtime, spy } = createRuntimeWithSpy()
    const host = { moduleId: 'm', moduleInstanceId: 'page-42', instanceId: 's' }
    const result = await runtime.executeTool(
      'node-tree_getNode',
      { $paths: ['page-42'], id: 'n1' },
      host,
    )
    expect(result.ok).toBe(true)
    expect(spy.lastHost).toEqual(host)
  })
})
