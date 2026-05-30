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
  runtime.register(createWorkspaceModule())
  runtime.register(createBoardModule())
  return runtime
}

function createWorkspaceModule(): AiModule {
  let title = '初始工作区'
  return new AiModule({
    kind: 'workspace',
    name: '工作区',
    description: '工作区根能力',
    attributes: [
      {
        name: 'title',
        description: '工作区标题',
        schema: { type: 'string' },
        readable: true,
        writable: true,
      },
    ],
    children: ['board'],
    attributeAccessor: {
      get: () => AiModuleResult.ok(title),
      set: (_ctx, _attrName, value) => {
        title = String(value)
        return AiModuleResult.ok<void>()
      },
    },
    list: () => AiModuleResult.ok<readonly AiModuleInstanceRef[]>([
      { id: 'board-1', label: '主工作板' },
    ]),
    find: (ctx, childKind, query) => {
      if (ctx.segments.length === 0 && childKind === 'workspace') {
        const id = typeof query['id'] === 'string' ? query['id'] : ctx.host?.moduleInstanceId ?? 'workspace-1'
        return AiModuleResult.ok<readonly AiModuleInstanceRef[]>([{ id, label: `工作区 ${id}` }])
      }
      if (childKind === 'board') {
        const id = typeof query['id'] === 'string' ? query['id'] : 'board-1'
        return AiModuleResult.ok<readonly AiModuleInstanceRef[]>([{ id, label: `工作板 ${id}` }])
      }
      return AiModuleResult.ok<readonly AiModuleInstanceRef[]>([])
    },
  })
}

function createBoardModule(spy: { host?: AiModulePathContext['host'] } = {}): AiModule {
  return new AiModule({
    kind: 'board',
    name: '工作板',
    description: '工作区工作板',
    parentKind: 'workspace',
    functions: [
      {
        name: 'getItem',
        description: '按条目 id 读取工作板条目',
        paramsSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false,
        },
        usageRules: ['先通过 module_find 确认工作板实例路径'],
        failureModes: [
          { code: 'ITEM_NOT_FOUND', when: '条目不存在', fix: '重新查询条目 id' },
        ],
      },
    ],
    runner: (ctx, functionName, args) => {
      spy.host = ctx.host
      if (functionName !== 'getItem') {
        return AiModuleResult.failCode('UNKNOWN_FUNCTION', functionName)
      }
      return AiModuleResult.ok<AiJsonValue>({
        id: args['id'] ?? null,
        path: ctx.segments.map((segment) => `${segment.kind}:${segment.id}`),
      })
    },
  })
}

describe('AiModuleRuntime function tool protocol', () => {
  it('exposes fixed module tools plus direct declared function tools', () => {
    const names = createRuntime().getTools().map((tool) => tool.function.name)

    expect(names).toEqual(expect.arrayContaining([
      PROTOCOL_TOOL_NAMES.moduleQuery,
      PROTOCOL_TOOL_NAMES.moduleGuide,
      PROTOCOL_TOOL_NAMES.moduleAttributeGuide,
      PROTOCOL_TOOL_NAMES.moduleFunctionGuide,
      PROTOCOL_TOOL_NAMES.moduleFind,
      PROTOCOL_TOOL_NAMES.moduleAttr,
      PROTOCOL_TOOL_NAMES.moduleCall,
      PROTOCOL_TOOL_NAMES.humanQuestion,
      PROTOCOL_TOOL_NAMES.agentComplete,
      'getItem',
    ]))
    expect(names).not.toContain('task_detail_getNode')
    expect(createRuntime().projectKnowledge().promptSnapshot).toContain('module_attribute_guide')
  })

  it('module_query returns module summaries and optional function summaries', async () => {
    const result = await createRuntime().executeTool('module_query', {
      keyword: '工作板',
      includeFunctions: true,
    })

    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({
      modules: expect.arrayContaining([
        expect.objectContaining({ kind: 'board', functionNames: ['getItem'] }),
      ]),
      functions: expect.arrayContaining([
        expect.objectContaining({
          toolName: 'getItem',
          kind: 'board',
          functionName: 'getItem',
        }),
      ]),
    })
  })

  it('module_guide reads kind metadata and module_*_guide reads concrete contracts', async () => {
    const runtime = createRuntime()

    await expect(runtime.executeTool('module_guide', { kind: 'workspace' })).resolves.toMatchObject({
      ok: true,
      data: expect.objectContaining({
        kind: 'workspace',
        registeredPrompt: '工作区根能力',
        attributes: [expect.objectContaining({
          knowledgeLevel: 'directory',
          name: 'title',
          detailToolName: 'module_attribute_guide',
        })],
      }),
    })
    await expect(runtime.executeTool('module_attribute_guide', {
      kind: 'workspace',
      attrName: 'title',
    })).resolves.toMatchObject({
      ok: true,
      data: expect.objectContaining({
        knowledgeLevel: 'detail',
        kind: 'workspace',
        attrName: 'title',
        schema: expect.objectContaining({ type: 'string' }),
      }),
    })
    await expect(runtime.executeTool('module_guide', {
      kind: 'board',
      functionName: 'getItem',
    })).resolves.toMatchObject({
      ok: false,
      checks: [expect.objectContaining({ code: 'INVALID_TOOL_ARGS' })],
    })
    await expect(runtime.executeTool('module_function_guide', {
      kind: 'board',
      functionName: 'getItem',
    })).resolves.toMatchObject({
      ok: true,
      data: expect.objectContaining({
        toolName: 'getItem',
        functionName: 'getItem',
        paramsSchema: expect.objectContaining({ required: ['id'] }),
        callPattern: expect.objectContaining({ toolName: 'getItem' }),
      }),
    })
  })

  it('module_find supports root discovery, root lookup and child lookup', async () => {
    const runtime = createRuntime()

    await expect(runtime.executeTool('module_find', { path: '/' })).resolves.toMatchObject({
      ok: true,
      data: [expect.objectContaining({ id: 'workspace' })],
    })
    await expect(runtime.executeTool('module_find', {
      path: '/',
      childKind: 'workspace',
      query: { id: 'workspace-a' },
    })).resolves.toMatchObject({
      ok: true,
      data: [expect.objectContaining({ id: 'workspace-a' })],
    })
    await expect(runtime.executeTool('module_find', {
      path: '/workspace[workspace-a]',
      childKind: 'board',
      query: { id: 'board-1' },
    })).resolves.toMatchObject({
      ok: true,
      data: [expect.objectContaining({ id: 'board-1' })],
    })
  })

  it('module_attr reads and writes attributes through explicit accessor', async () => {
    const runtime = createRuntime()
    const path = '/workspace[workspace-a]'

    await expect(runtime.executeTool('module_attr', {
      op: 'set',
      path,
      attrName: 'title',
      value: '工单工作区',
    })).resolves.toMatchObject({ ok: true })
    await expect(runtime.executeTool('module_attr', {
      op: 'get',
      path,
      attrName: 'title',
    })).resolves.toMatchObject({
      ok: true,
      data: '工单工作区',
    })
  })

  it('module_call compatibility route uses { path, functionName, args } and passes host context', async () => {
    const spy: { host?: AiModulePathContext['host'] } = {}
    const runtime = new AiModuleRuntime()
    runtime.register(createWorkspaceModule())
    runtime.register(createBoardModule(spy))

    const host = { moduleId: 'workspace', moduleInstanceId: 'workspace-a', instanceId: 'turn-1' }
    const result = await runtime.executeTool('module_call', {
      path: '/workspace[workspace-a]/board[board-1]',
      functionName: 'getItem',
      args: { id: 'item-1' },
    }, host)

    expect(result).toMatchObject({
      ok: true,
      data: {
        id: 'item-1',
        path: ['workspace:workspace-a', 'board:board-1'],
      },
    })
    expect(spy.host).toEqual(host)
  })

  it('direct function tools use functionName({ path, args }) and pass host context', async () => {
    const spy: { host?: AiModulePathContext['host'] } = {}
    const runtime = new AiModuleRuntime()
    runtime.register(createWorkspaceModule())
    runtime.register(createBoardModule(spy))

    const host = { moduleId: 'workspace', moduleInstanceId: 'workspace-a', instanceId: 'turn-1' }
    const result = await runtime.executeTool('getItem', {
      path: '/workspace[workspace-a]/board[board-1]',
      args: { id: 'item-1' },
    }, host)

    expect(result).toMatchObject({
      ok: true,
      data: {
        id: 'item-1',
        path: ['workspace:workspace-a', 'board:board-1'],
      },
    })
    expect(spy.host).toEqual(host)
  })

  it('rejects the deleted dynamic function tool protocol', async () => {
    const result = await createRuntime().executeTool('task_detail_getNode', {
      $paths: ['task-a', 'detail-1'],
      id: 'item-1',
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
    const path = AiModulePath.parse('/workspace[workspace-a]')

    await expect(runtime.getAttribute(path, 'title')).resolves.toMatchObject({
      ok: true,
      data: '初始工作区',
    })
    expect(runtime.queryKnowledgeModules({ kind: 'board' })).toHaveLength(1)
  })
})
