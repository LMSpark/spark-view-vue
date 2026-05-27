import { describe, expect, it } from 'vitest'

import { coerceJsonValue, coerceStrictJsonValue, paramsSchema, stringSchema } from '../json'
import { AiModuleRegistry } from '../modules/internal/ai-module-registry'
import { AiModuleKnowledgeProjector } from '../modules/knowledge/ai-module-knowledge'
import { AiModule, AiModuleResult, type AiModuleInstanceRef } from '../modules'

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
    const moduleKind = createRootKind('pageDesign', 'Page Design')

    expect(registry.register(moduleKind)).toBe(moduleKind)
    expect(registry.get('pageDesign')).toBe(moduleKind)
    expect(registry.list()).toEqual([moduleKind])
  })

  it('rejects duplicate kind registration', () => {
    const registry = new AiModuleRegistry()
    registry.register(createRootKind('dup'))

    expect(() => registry.register(createRootKind('dup'))).toThrow('AiModule "dup" is already registered')
  })
})

describe('AiModuleKnowledgeProjector', () => {
  it('projects module and function summaries for the fixed module_call protocol', () => {
    const registry = new AiModuleRegistry()
    registry.register(createRootKind('pageDesign', 'Page Design'))
    registry.register(createFunctionKind())
    const projector = new AiModuleKnowledgeProjector(registry)

    expect(projector.queryModules({ kind: 'pageDesign' })).toEqual([
      expect.objectContaining({ kind: 'pageDesign', pathPattern: '/pageDesign[<pageDesignId>]' }),
    ])
    expect(projector.queryFunctions({ keyword: 'work' })).toEqual([
      expect.objectContaining({
        toolName: 'module_call',
        kind: 'task',
        functionName: 'doWork',
        requiredParamNames: ['input'],
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
        toolName: 'module_call',
        kind: 'task',
        functionName: 'doWork',
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
      context: '修改页面',
      reason: '缺少目标页面',
      missingFacts: ['目标页面 ID'],
    })

    expect(result).toMatchObject({
      ok: true,
      data: {
        shouldAskHuman: true,
        stopToolCalls: true,
        question: expect.stringContaining('目标页面 ID'),
      },
    })
  })
})
