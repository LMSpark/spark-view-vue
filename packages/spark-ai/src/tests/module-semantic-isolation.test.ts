import { describe, expect, it } from 'vitest'

import { coerceJsonValue, coerceStrictJsonValue, paramsSchema, stringSchema } from '../json'
import { AiModuleRegistry } from '../modules/internal/ai-module-registry'
import { AiModuleKnowledgeProjector } from '../modules/knowledge/ai-module-knowledge'
import {
  AiModule,
  AiModuleResult,
  AiModuleRuntime,
  appendAiModulePath,
  buildAiModulePath,
  parseAiModulePath,
  type AiModuleInstanceRef,
} from '../modules'

function createRootKind(kind: string, name = kind): AiModule {
  return new AiModule({
    kind,
    name,
    description: `${name} description.`,
    find: (_ctx, childKind, query) => {
      if (childKind !== kind) return AiModuleResult.ok<readonly AiModuleInstanceRef[]>([])
      const id = typeof query['id'] === 'string' ? query['id'] : `${kind}-1`
      return AiModuleResult.ok<readonly AiModuleInstanceRef[]>([{ id, label: name }])
    },
  })
}

function createFunctionKind(): AiModule {
  return new AiModule({
    kind: 'task',
    name: 'Task',
    description: 'Task module.',
    functions: [{
      name: 'doWork',
      description: 'Execute work.',
      paramsSchema: paramsSchema({ input: stringSchema('Work input.') }, ['input']),
      requiredBeforeCall: ['先确认目标 task 实例 path。'],
      examples: [{
        intent: '用户要求执行工作',
        args: { input: 'demo' },
      }],
      antiExamples: [{
        user: '只是查看状态',
        reason: '查看状态不应调用 doWork。',
      }],
    }],
    runner: (_ctx, _functionName, args) => AiModuleResult.ok(args),
    find: () => AiModuleResult.ok<readonly AiModuleInstanceRef[]>([{ id: 'task-1', label: 'Task' }]),
  })
}

describe('json coercion helpers', () => {
  it('coerceJsonValue keeps useful runtime values JSON-readable', () => {
    const obj: Record<string, unknown> = {
      date: new Date('2026-05-23T00:00:00.000Z'),
      big: 123n,
      bytes: new Uint8Array([1, 2, 3]),
    }
    obj['self'] = obj

    expect(coerceJsonValue(obj)).toEqual({
      date: '2026-05-23T00:00:00.000Z',
      big: '123',
      bytes: [1, 2, 3],
    })
  })

  it('coerceStrictJsonValue rejects non JSON-safe values', () => {
    expect(coerceStrictJsonValue({ ok: true })).toEqual({ ok: true })
    expect(coerceStrictJsonValue(Number.NaN)).toBeUndefined()
    expect(coerceStrictJsonValue(123n)).toBeUndefined()
    expect(coerceStrictJsonValue({ ok: 1, bad: 123n })).toBeUndefined()
  })
})

describe('AiModuleRegistry', () => {
  it('registers only constructed AiModule instances', () => {
    const registry = new AiModuleRegistry()
    const moduleKind = createRootKind('workspace', 'Workspace')

    expect(registry.register(moduleKind)).toBe(moduleKind)
    expect(registry.get('workspace')).toBe(moduleKind)
    expect(registry.list()).toEqual([moduleKind])
  })

  it('rejects duplicate kind registration', () => {
    const registry = new AiModuleRegistry()
    registry.register(createRootKind('dup'))

    expect(() => registry.register(createRootKind('dup'))).toThrow('AiModule "dup" is already registered')
  })
})

describe('AiModuleKnowledgeProjector', () => {
  it('projects module and direct function summaries for the OpenAI tool protocol', () => {
    const registry = new AiModuleRegistry()
    registry.register(createRootKind('workspace', 'Workspace'))
    registry.register(createFunctionKind())
    const projector = new AiModuleKnowledgeProjector(registry)

    expect(projector.queryModules({ kind: 'workspace' })).toEqual([
      expect.objectContaining({ kind: 'workspace', pathPattern: '/workspace[<workspaceId>]' }),
    ])
    expect(projector.queryFunctions({ keyword: 'work' })).toEqual([
      expect.objectContaining({
        knowledgeLevel: 'directory',
        toolName: 'doWork',
        kind: 'task',
        functionName: 'doWork',
        detailToolName: 'module_function_guide',
        detailLookupStep: 'module_function_guide({ kind: "task", functionName: "doWork" })',
        hasParams: true,
      }),
    ])
  })

  it('guides functions by kind and functionName, without dynamic tool decoding', () => {
    const registry = new AiModuleRegistry()
    registry.register(createFunctionKind())
    const projector = new AiModuleKnowledgeProjector(registry)

    const result = projector.guideFunction({ kind: 'task', functionName: 'doWork' })

    expect(result).toMatchObject({
      ok: true,
      data: {
        knowledgeLevel: 'detail',
        toolName: 'doWork',
        kind: 'task',
        functionName: 'doWork',
        directoryLookupStep: 'module_query({ kind: "task", keyword: "doWork", includeFunctions: true })',
        callPattern: {
          toolName: 'doWork',
          path: '/task[<taskId>]',
        },
        requiredBeforeCall: ['先确认目标 task 实例 path。'],
        examples: [expect.objectContaining({ intent: '用户要求执行工作' })],
        antiExamples: [expect.objectContaining({ reason: '查看状态不应调用 doWork。' })],
        recoveryHints: expect.arrayContaining([
          expect.stringContaining('module_function_guide'),
          expect.stringContaining('module_find'),
        ]),
      },
    })
    expect(projector.guideFunction({ kind: '', functionName: '' })).toMatchObject({
      ok: false,
      checks: [expect.objectContaining({ code: 'INVALID_GUIDE_REQUEST' })],
    })
  })

  it('produces human-question guidance without mutating history', () => {
    const projector = new AiModuleKnowledgeProjector(new AiModuleRegistry())

    const result = projector.guideHumanQuestion({
      context: '修改任务',
      reason: '缺少目标任务',
      missingFacts: ['目标任务 ID'],
    })

    expect(result).toMatchObject({
      ok: true,
      data: {
        shouldAskHuman: true,
        stopToolCalls: true,
        question: expect.stringContaining('目标任务 ID'),
      },
    })
  })
})

describe('AiModuleRuntime.inspect', () => {
  it('reports a clean runtime and summarizes registered modules', () => {
    const runtime = new AiModuleRuntime()
    runtime.register(createRootKind('workspace', 'Workspace'))

    expect(runtime.inspect()).toMatchObject({
      ok: true,
      status: 'ok',
      rootKinds: ['workspace'],
      modules: [
        expect.objectContaining({
          kind: 'workspace',
          status: 'ok',
          functionCount: 0,
        }),
      ],
      findings: [],
    })
  })

  it('finds broken child declarations before tool execution', () => {
    const runtime = new AiModuleRuntime()
    runtime.register(new AiModule({
      kind: 'parent',
      name: 'Parent',
      description: 'Parent module.',
      children: ['child'],
      list: () => AiModuleResult.ok<readonly AiModuleInstanceRef[]>([]),
      find: () => AiModuleResult.ok<readonly AiModuleInstanceRef[]>([{ id: 'parent-1', label: 'Parent' }]),
    }))

    expect(runtime.inspect()).toMatchObject({
      ok: false,
      status: 'error',
      findings: [
        expect.objectContaining({
          code: 'CHILD_KIND_NOT_REGISTERED',
          kind: 'parent',
          childKind: 'child',
        }),
      ],
    })
  })

  it('reports non-direct OpenAI function names without blocking module_call fallback', () => {
    const runtime = new AiModuleRuntime()
    runtime.register(new AiModule({
      kind: 'alpha',
      name: 'Alpha',
      description: 'Alpha module.',
      functions: [
        {
          name: 'sameAction',
          description: 'Duplicate direct tool name.',
          paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
        },
        {
          name: 'bad.name',
          description: 'Invalid OpenAI tool name.',
          paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
        },
        {
          name: 'module_query',
          description: 'Reserved protocol tool name.',
          paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
        },
      ],
      runner: () => AiModuleResult.ok({ ok: true }),
      find: () => AiModuleResult.ok<readonly AiModuleInstanceRef[]>([{ id: 'alpha-1', label: 'Alpha' }]),
    }))
    runtime.register(new AiModule({
      kind: 'beta',
      name: 'Beta',
      description: 'Beta module.',
      functions: [{
        name: 'sameAction',
        description: 'Duplicate direct tool name.',
        paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
      }],
      runner: () => AiModuleResult.ok({ ok: true }),
      find: () => AiModuleResult.ok<readonly AiModuleInstanceRef[]>([{ id: 'beta-1', label: 'Beta' }]),
    }))

    expect(runtime.inspect()).toMatchObject({
      ok: true,
      status: 'ok',
      findings: expect.arrayContaining([
        expect.objectContaining({
          level: 'info',
          code: 'DIRECT_FUNCTION_TOOL_NAME_CONFLICT',
          kind: 'alpha',
          functionName: 'sameAction',
        }),
        expect.objectContaining({
          level: 'info',
          code: 'DIRECT_FUNCTION_TOOL_NAME_CONFLICT',
          kind: 'beta',
          functionName: 'sameAction',
        }),
        expect.objectContaining({
          level: 'info',
          code: 'DIRECT_FUNCTION_TOOL_NAME_INVALID',
          kind: 'alpha',
          functionName: 'bad.name',
        }),
        expect.objectContaining({
          level: 'info',
          code: 'DIRECT_FUNCTION_TOOL_NAME_RESERVED',
          kind: 'alpha',
          functionName: 'module_query',
        }),
      ]),
    })
  })
})

describe('AiModule path helpers', () => {
  it('builds, appends and parses paths with escaped ids', () => {
    const rootPath = buildAiModulePath([
      { kind: 'workspace', id: 'workspace/a' },
    ])
    const childPath = appendAiModulePath(rootPath, {
      kind: 'board',
      id: 'board]main',
    })

    expect(rootPath).toBe('/workspace[workspace%2Fa]')
    expect(childPath).toBe('/workspace[workspace%2Fa]/board[board%5Dmain]')
    expect(parseAiModulePath(childPath)).toEqual([
      { kind: 'workspace', id: 'workspace/a' },
      { kind: 'board', id: 'board]main' },
    ])
  })
})
