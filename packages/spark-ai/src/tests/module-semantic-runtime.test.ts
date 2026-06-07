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
      PROTOCOL_TOOL_NAMES.moduleScript,
      PROTOCOL_TOOL_NAMES.moduleMemory,
      PROTOCOL_TOOL_NAMES.humanQuestion,
      PROTOCOL_TOOL_NAMES.agentComplete,
      'getItem',
    ]))
    expect(names).not.toContain('task_detail_getNode')
    expect(createRuntime().projectKnowledge().promptSnapshot).toContain('module_attribute_guide')
  })

  it('executes scripts with this bound to the module context itself', async () => {
    const result = await createRuntime().executeTool('module_script', {
      script: `
        const guide = await this.module_function_guide({ kind: 'board', functionName: 'getItem' })
        const item = await this.call('getItem', {
          path: '/workspace[workspace-a]/board[board-1]',
          args: { id: 'item-1' },
        })
        return {
          guideOk: guide.ok,
          functionName: guide.data.functionName,
          item: item.data,
          sameContext: this === ctx,
        }
      `,
    })

    expect(result).toMatchObject({
      ok: true,
      data: {
        guideOk: true,
        functionName: 'getItem',
        item: {
          id: 'item-1',
          path: ['workspace:workspace-a', 'board:board-1'],
        },
        sameContext: true,
      },
    })
  })

  it('reports module_script runtime error line numbers', async () => {
    const result = await createRuntime().executeTool('module_script', {
      script: [
        'const first = 1',
        'const second = first + 1',
        'throw new Error("boom")',
      ].join('\n'),
    })

    expect(result).toMatchObject({
      ok: false,
      checks: [{
        code: 'SCRIPT_EXECUTION_FAILED',
      }],
    })
    expect(result.checks?.[0]?.message).toContain('脚本第 3 行')
    expect(result.checks?.[0]?.hint).toContain('脚本第 3 行')
  })

  it('stores temporary scoped memory through module_memory', async () => {
    const runtime = createRuntime()
    const leftHost = { moduleId: 'workspace', moduleInstanceId: 'left', instanceId: 'turn-1' }
    const rightHost = { moduleId: 'workspace', moduleInstanceId: 'right', instanceId: 'turn-1' }

    await expect(runtime.executeTool('module_memory', {
      op: 'set',
      key: 'selectedFunction',
      value: 'getItem',
    }, leftHost)).resolves.toMatchObject({
      ok: true,
      data: { key: 'selectedFunction', value: 'getItem' },
    })

    await expect(runtime.executeTool('module_memory', {
      op: 'get',
      key: 'selectedFunction',
    }, leftHost)).resolves.toMatchObject({
      ok: true,
      data: { found: true, value: 'getItem' },
    })

    await expect(runtime.executeTool('module_memory', {
      op: 'get',
      key: 'selectedFunction',
    }, rightHost)).resolves.toMatchObject({
      ok: true,
      data: { found: false, value: null },
    })
  })

  it('exposes temporary memory inside module_script', async () => {
    const result = await createRuntime().executeTool('module_script', {
      script: `
        this.memory.set('draftArgs', { id: 'item-2' })
        return {
          keys: this.memory.list(),
          draftArgs: this.memory.get('draftArgs'),
          snapshot: this.memory.snapshot(),
        }
      `,
    })

    expect(result).toMatchObject({
      ok: true,
      data: {
        keys: ['draftArgs'],
        draftArgs: { id: 'item-2' },
        snapshot: {
          draftArgs: { id: 'item-2' },
        },
      },
    })
  })

  it('binds module_script this to root kind when host.moduleId differs from kind', async () => {
    const runtime = new AiModuleRuntime()
    runtime.register(new AiModule({
      kind: 'project',
      name: 'Project',
      description: 'Root project module.',
      scriptContext: () => ({ marker: 'project-root' }),
      find: () => AiModuleResult.ok([]),
    }))

    const result = await runtime.executeTool('module_script', {
      script: 'return this.marker',
    }, {
      moduleId: 'modelEditor',
      moduleInstanceId: 'leave-page',
      instanceId: 'turn-1',
    })

    expect(result).toMatchObject({
      ok: true,
      data: 'project-root',
    })
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
    await expect(runtime.executeTool('module_function_guide', {
      kind: 'project',
      functionName: 'module_find',
    })).resolves.toMatchObject({
      ok: false,
      checks: [expect.objectContaining({ code: 'INVALID_TOOL_ARGS' })],
    })
    await expect(runtime.executeTool('module_function_guide', {
      kind: 'board',
      name: 'getItem',
    })).resolves.toMatchObject({
      ok: true,
      data: expect.objectContaining({ functionName: 'getItem' }),
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

  it('coalesces flat direct function args into { path, args } and infers path from host', async () => {
    const spy: { host?: AiModulePathContext['host'] } = {}
    const runtime = new AiModuleRuntime()
    runtime.register(createWorkspaceModule())
    runtime.register(createBoardModule(spy))

    const host = { moduleId: 'workspace', moduleInstanceId: 'workspace-a', instanceId: 'turn-1' }
    const withFlatBusinessArgs = await runtime.executeTool('getItem', {
      path: '/workspace[workspace-a]/board[board-1]',
      id: 'item-flat',
    }, host)
    expect(withFlatBusinessArgs).toMatchObject({
      ok: true,
      data: { id: 'item-flat' },
    })
  })

  it('infers root project path when host.moduleId is a business alias', async () => {
    const runtime = new AiModuleRuntime()
    runtime.register(new AiModule({
      kind: 'project',
      name: 'Project',
      description: 'Root project module.',
      functions: [{
        name: 'echoPage',
        description: 'Echo page id.',
        paramsSchema: {
          type: 'object',
          properties: { pageId: { type: 'string' } },
          required: ['pageId'],
          additionalProperties: false,
        },
      }],
      runner: (_ctx, functionName, args) => {
        if (functionName !== 'echoPage') {
          return AiModuleResult.failCode('UNKNOWN_FUNCTION', functionName)
        }
        return AiModuleResult.ok<AiJsonValue>({ pageId: args['pageId'] ?? null })
      },
      find: () => AiModuleResult.ok([]),
    }))

    const host = { moduleId: 'modelEditor', moduleInstanceId: 'leave-page', instanceId: 'turn-1' }
    const result = await runtime.executeTool('echoPage', { pageId: 'leave-page' }, host)
    expect(result).toMatchObject({
      ok: true,
      data: { pageId: 'leave-page' },
    })
  })

  it('defaults openPageDesign pageId from host when direct call args are empty', async () => {
    const runtime = new AiModuleRuntime()
    runtime.register(new AiModule({
      kind: 'project',
      name: 'Project',
      description: 'Root project module.',
      functions: [{
        name: 'openPageDesign',
        description: 'Open page design.',
        paramsSchema: {
          type: 'object',
          properties: { pageId: { type: 'string' } },
          required: ['pageId'],
          additionalProperties: false,
        },
      }],
      runner: (_ctx, functionName, args) => {
        if (functionName !== 'openPageDesign') {
          return AiModuleResult.failCode('UNKNOWN_FUNCTION', functionName)
        }
        return AiModuleResult.ok<AiJsonValue>({ pageId: args['pageId'] ?? null })
      },
      find: () => AiModuleResult.ok([]),
    }))

    const host = { moduleId: 'modelEditor', moduleInstanceId: 'leave-page', instanceId: 'turn-1' }
    const result = await runtime.executeTool('openPageDesign', {}, host)
    expect(result).toMatchObject({
      ok: true,
      data: { pageId: 'leave-page' },
    })
  })

  it('coalesces flat module_find query fields into { query }', async () => {
    const runtime = createRuntime()

    await expect(runtime.executeTool('module_find', {
      path: '/',
      childKind: 'workspace',
      id: 'workspace-a',
    })).resolves.toMatchObject({
      ok: true,
      data: [expect.objectContaining({ id: 'workspace-a' })],
    })
    await expect(runtime.executeTool('module_find', {
      childKind: 'workspace',
      query: { id: 'workspace-a' },
    })).resolves.toMatchObject({
      ok: true,
      data: [expect.objectContaining({ id: 'workspace-a' })],
    })
  })

  it('accepts module_script code alias as script', async () => {
    const result = await createRuntime().executeTool('module_script', {
      code: 'return this.$tools.module_query({ keyword: "工作板" })',
    })
    expect(result.ok).toBe(true)
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

  it('allows metadata-only attributes and fails only on runtime access without accessor', async () => {
    const runtime = new AiModuleRuntime()
    runtime.register(new AiModule({
      kind: 'metadata-only',
      name: '元数据属性',
      description: '只声明属性元数据',
      attributes: [{
        name: 'config',
        description: '复杂配置',
        schema: { type: 'object', properties: { title: { type: 'string' } } },
        readable: true,
        writable: false,
      }],
      find: () => AiModuleResult.ok([]),
    }))

    expect(runtime.guideKnowledgeAttribute({ kind: 'metadata-only', attrName: 'config' })).toMatchObject({
      ok: true,
      data: { name: 'config' },
    })
    await expect(runtime.getAttribute(AiModulePath.parse('/metadata-only[root]'), 'config')).resolves.toMatchObject({
      ok: false,
      checks: [{ code: 'ATTRIBUTE_ACCESSOR_NOT_REGISTERED' }],
    })
  })
})
