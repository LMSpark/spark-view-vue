import { describe, expect, it } from 'vitest'

import {
  AiModule,
  AiModulePath,
  AiModuleResult,
  AiModuleRuntime,
  type AiModuleInstanceRef,
  type AiModulePathContext,
} from '../modules'
import { PROTOCOL_TOOL_NAMES } from '../modules/internal/protocol-tool-generator'
import type { AiJsonValue } from '../json'

function createRuntime(): AiModuleRuntime {
  const runtime = new AiModuleRuntime()
  runtime.register(createPageDesignModule())
  runtime.register(createNodeTreeModule())
  return runtime
}

function createPageDesignModule(): AiModule {
  let title = '初始页面'
  return new AiModule({
    kind: 'pageDesign',
    name: '页面设计',
    description: '页面设计根能力',
    attributes: [
      {
        name: 'title',
        description: '页面标题',
        schema: { type: 'string' },
        readable: true,
        writable: true,
      },
    ],
    children: ['node-tree'],
    attributeAccessor: {
      get: () => AiModuleResult.ok(title),
      set: (_ctx, _attrName, value) => {
        title = String(value)
        return AiModuleResult.ok<void>()
      },
    },
    list: () => AiModuleResult.ok<readonly AiModuleInstanceRef[]>([
      { id: 'tree-1', label: '主节点树' },
    ]),
    find: (ctx, childKind, query) => {
      if (ctx.segments.length === 0 && childKind === 'pageDesign') {
        const id = typeof query['id'] === 'string' ? query['id'] : ctx.host?.moduleInstanceId ?? 'page-1'
        return AiModuleResult.ok<readonly AiModuleInstanceRef[]>([{ id, label: `页面 ${id}` }])
      }
      if (childKind === 'node-tree') {
        const id = typeof query['id'] === 'string' ? query['id'] : 'tree-1'
        return AiModuleResult.ok<readonly AiModuleInstanceRef[]>([{ id, label: `节点树 ${id}` }])
      }
      return AiModuleResult.ok<readonly AiModuleInstanceRef[]>([])
    },
  })
}

function createNodeTreeModule(spy: { host?: AiModulePathContext['host'] } = {}): AiModule {
  return new AiModule({
    kind: 'node-tree',
    name: '节点树',
    description: '页面节点树',
    parentKind: 'pageDesign',
    functions: [
      {
        name: 'getNode',
        description: '按节点 id 读取节点',
        paramsSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false,
        },
        usageRules: ['先通过 module_find 确认节点树实例路径'],
        failureModes: [
          { code: 'NODE_NOT_FOUND', when: '节点不存在', fix: '重新查询节点 id' },
        ],
      },
    ],
    runner: (ctx, functionName, args) => {
      spy.host = ctx.host
      if (functionName !== 'getNode') {
        return AiModuleResult.failCode('UNKNOWN_FUNCTION', functionName)
      }
      return AiModuleResult.ok<AiJsonValue>({
        id: args['id'] ?? null,
        path: ctx.segments.map((segment) => `${segment.kind}:${segment.id}`),
      })
    },
  })
}

describe('AiModuleRuntime fixed tool protocol', () => {
  it('exposes only the six fixed module tools', () => {
    const names = createRuntime().getTools().map((tool) => tool.function.name)

    expect(names).toEqual([
      PROTOCOL_TOOL_NAMES.moduleQuery,
      PROTOCOL_TOOL_NAMES.moduleGuide,
      PROTOCOL_TOOL_NAMES.moduleFind,
      PROTOCOL_TOOL_NAMES.moduleAttr,
      PROTOCOL_TOOL_NAMES.moduleCall,
      PROTOCOL_TOOL_NAMES.humanQuestion,
    ])
    expect(names).not.toContain('pageDesign_node-tree_getNode')
  })

  it('module_query returns module summaries and optional function summaries', async () => {
    const result = await createRuntime().executeTool('module_query', {
      keyword: '节点',
      includeFunctions: true,
    })

    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({
      modules: expect.arrayContaining([
      expect.objectContaining({ kind: 'node-tree', functionNames: ['getNode'] }),
    ]),
      functions: expect.arrayContaining([
      expect.objectContaining({
        toolName: 'module_call',
        kind: 'node-tree',
        functionName: 'getNode',
      }),
    ]),
    })
  })

  it('module_guide reads kind metadata and function guide', async () => {
    const runtime = createRuntime()

    await expect(runtime.executeTool('module_guide', { kind: 'pageDesign' })).resolves.toMatchObject({
      ok: true,
      data: expect.objectContaining({
        kind: 'pageDesign',
        attributes: [expect.objectContaining({ name: 'title' })],
      }),
    })
    await expect(runtime.executeTool('module_guide', {
      kind: 'node-tree',
      functionName: 'getNode',
    })).resolves.toMatchObject({
      ok: true,
      data: expect.objectContaining({
        toolName: 'module_call',
        functionName: 'getNode',
        paramsSchema: expect.objectContaining({ required: ['id'] }),
      }),
    })
  })

  it('module_find supports root discovery, root lookup and child lookup', async () => {
    const runtime = createRuntime()

    await expect(runtime.executeTool('module_find', { path: '/' })).resolves.toMatchObject({
      ok: true,
      data: [expect.objectContaining({ id: 'pageDesign' })],
    })
    await expect(runtime.executeTool('module_find', {
      path: '/',
      childKind: 'pageDesign',
      query: { id: 'page-a' },
    })).resolves.toMatchObject({
      ok: true,
      data: [expect.objectContaining({ id: 'page-a' })],
    })
    await expect(runtime.executeTool('module_find', {
      path: '/pageDesign[page-a]',
      childKind: 'node-tree',
      query: { id: 'tree-1' },
    })).resolves.toMatchObject({
      ok: true,
      data: [expect.objectContaining({ id: 'tree-1' })],
    })
  })

  it('module_attr reads and writes attributes through explicit accessor', async () => {
    const runtime = createRuntime()
    const path = '/pageDesign[page-a]'

    await expect(runtime.executeTool('module_attr', {
      op: 'set',
      path,
      attrName: 'title',
      value: '请假页面',
    })).resolves.toMatchObject({ ok: true })
    await expect(runtime.executeTool('module_attr', {
      op: 'get',
      path,
      attrName: 'title',
    })).resolves.toMatchObject({
      ok: true,
      data: '请假页面',
    })
  })

  it('module_call uses { path, functionName, args } and passes host context', async () => {
    const spy: { host?: AiModulePathContext['host'] } = {}
    const runtime = new AiModuleRuntime()
    runtime.register(createPageDesignModule())
    runtime.register(createNodeTreeModule(spy))

    const host = { moduleId: 'pageDesign', moduleInstanceId: 'page-a', instanceId: 'turn-1' }
    const result = await runtime.executeTool('module_call', {
      path: '/pageDesign[page-a]/node-tree[tree-1]',
      functionName: 'getNode',
      args: { id: 'node-1' },
    }, host)

    expect(result).toMatchObject({
      ok: true,
      data: {
        id: 'node-1',
        path: ['pageDesign:page-a', 'node-tree:tree-1'],
      },
    })
    expect(spy.host).toEqual(host)
  })

  it('rejects the deleted dynamic function tool protocol', async () => {
    const result = await createRuntime().executeTool('pageDesign_node-tree_getNode', {
      $paths: ['page-a', 'tree-1'],
      id: 'node-1',
    })

    expect(result).toMatchObject({
      ok: false,
      checks: [expect.objectContaining({ code: 'UNKNOWN_TOOL' })],
    })
  })
})

describe('AiModule explicit delegate requirements', () => {
  it('requires runner/list/find when metadata declares functions or children', () => {
    expect(() => new AiModule({
      kind: 'fn-root',
      name: '函数根',
      description: '缺少 runner',
      functions: [{
        name: 'run',
        description: 'run',
        paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
      }],
      find: () => AiModuleResult.ok([]),
    })).toThrow('runner for "fn-root" is required')

    expect(() => new AiModule({
      kind: 'child-root',
      name: '子模块根',
      description: '缺少 list',
      children: ['child'],
      find: () => AiModuleResult.ok([]),
    })).toThrow('list for "child-root" is required')

    expect(() => new AiModule({
      kind: 'root-without-find',
      name: '根模块',
      description: '缺少 find',
    })).toThrow('find for "root-without-find" is required')
  })

  it('keeps direct runtime APIs for internal callers', async () => {
    const runtime = createRuntime()
    const path = AiModulePath.parse('/pageDesign[page-a]')

    await expect(runtime.getAttribute(path, 'title')).resolves.toMatchObject({
      ok: true,
      data: '初始页面',
    })
    expect(runtime.queryKnowledgeModules({ kind: 'node-tree' })).toHaveLength(1)
  })
})
