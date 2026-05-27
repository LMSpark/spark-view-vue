/**
 * Module-semantic 隔离单元测试。
 *
 * 覆盖独立于 Runtime 组合根的组件：
 *   - business-function-tool-name
 *   - schema/coercion (coerceJsonValue / coerceStrictJsonValue)
 *   - ModuleKindRegistry
 *   - KnowledgeProjector
 */

import { describe, expect, it } from 'vitest'
import { createBusinessFunctionToolName, parseBusinessFunctionToolName } from '../module-semantic/internal/business-function-tool-name'
import { coerceJsonValue, coerceStrictJsonValue } from '../schema/coercion'
import { ModuleKindRegistry } from '../module-semantic/internal/module-kind-registry'
import {
  ModuleSemanticKnowledgeProjector,
} from '../module-semantic/knowledge/module-semantic-knowledge'
import { ModuleKind } from '../module-semantic/protocol'
import {
  paramsSchema,
  stringSchema,
} from '../schema'

// ── business-function-tool-name ──────────────────────────────

describe('createBusinessFunctionToolName', () => {
  it('将 kindPath + functionName 用 _ 连接', () => {
    expect(createBusinessFunctionToolName(['pageDesign', 'lifecycle'], 'describeProgress'))
      .toBe('pageDesign_lifecycle_describeProgress')
  })

  it('单层 kindPath 直接拼 functionName', () => {
    expect(createBusinessFunctionToolName(['node-tree'], 'getNode'))
      .toBe('node-tree_getNode')
  })

  it('空 kindPath 抛出明确错误', () => {
    expect(() => createBusinessFunctionToolName([], 'fn'))
      .toThrow('Invalid business function tool name')
  })

  it('含非法字符的 segment 抛出错误', () => {
    expect(() => createBusinessFunctionToolName(['page.Design'], 'fn'))
      .toThrow('Invalid business function tool name')
  })

  it('超长工具名(>64 字符)抛出错误', () => {
    const longKind = 'a'.repeat(62)
    expect(() => createBusinessFunctionToolName([longKind], 'fn'))
      .toThrow('too long')
  })
})

describe('parseBusinessFunctionToolName', () => {
  it('合法 toolName 往返解析', () => {
    const parsed = parseBusinessFunctionToolName('pageDesign_lifecycle_describeProgress')
    expect(parsed).not.toBeNull()
    expect(parsed!.kindPath).toEqual(['pageDesign', 'lifecycle'])
    expect(parsed!.functionName).toBe('describeProgress')
    expect(parsed!.toolName).toBe('pageDesign_lifecycle_describeProgress')
  })

  it('单层 kindPath 正确解析', () => {
    const parsed = parseBusinessFunctionToolName('node-tree_getNode')
    expect(parsed).not.toBeNull()
    expect(parsed!.kindPath).toEqual(['node-tree'])
    expect(parsed!.functionName).toBe('getNode')
  })

  it('无下划线返回 null', () => {
    expect(parseBusinessFunctionToolName('noUnderscore')).toBeNull()
  })

  it('编码不一致返回 null(防篡改)', () => {
    expect(parseBusinessFunctionToolName('a_b.c')).toBeNull()
  })

  it('空字符串返回 null', () => {
    expect(parseBusinessFunctionToolName('')).toBeNull()
  })
})

// ── coerceJsonValue / coerceStrictJsonValue ──────────────────

describe('coerceJsonValue', () => {
  it('原始值原样返回', () => {
    expect(coerceJsonValue('hello')).toBe('hello')
    expect(coerceJsonValue(42)).toBe(42)
    expect(coerceJsonValue(true)).toBe(true)
    expect(coerceJsonValue(null)).toBe(null)
  })

  it('NaN 返回 undefined', () => {
    expect(coerceJsonValue(Number.NaN)).toBeUndefined()
  })

  it('undefined 返回 undefined', () => {
    expect(coerceJsonValue(undefined)).toBeUndefined()
  })

  it('Date 转为 ISO 字符串', () => {
    expect(coerceJsonValue(new Date('2026-05-23T00:00:00.000Z')))
      .toBe('2026-05-23T00:00:00.000Z')
  })

  it('BigInt 转为数字字符串', () => {
    expect(coerceJsonValue(123n)).toBe('123')
  })

  it('Symbol 转为 Symbol(description) 字符串', () => {
    const result = coerceJsonValue(Symbol('demo'))
    expect(typeof result).toBe('string')
    expect(result).toContain('Symbol')
  })

  it('Uint8Array 转为数字数组', () => {
    expect(coerceJsonValue(new Uint8Array([1, 2, 3]))).toEqual([1, 2, 3])
  })

  it('循环引用的属性被跳过', () => {
    const obj: Record<string, unknown> = { name: 'test' }
    obj['self'] = obj
    const result = coerceJsonValue(obj)
    expect(result).toEqual({ name: 'test' })
  })

  it('嵌套对象递归转换', () => {
    const result = coerceJsonValue({ name: 'test', meta: { count: 1 } })
    expect(result).toEqual({ name: 'test', meta: { count: 1 } })
  })

  it('数组递归转换', () => {
    const result = coerceJsonValue([1, 'two', { key: true }])
    expect(result).toEqual([1, 'two', { key: true }])
  })
})

describe('coerceStrictJsonValue', () => {
  it('JSON 安全值原样返回', () => {
    expect(coerceStrictJsonValue({ a: 1, b: [2] })).toEqual({ a: 1, b: [2] })
  })

  it('NaN 返回 undefined', () => {
    expect(coerceStrictJsonValue(Number.NaN)).toBeUndefined()
  })

  it('Infinity 返回 undefined', () => {
    expect(coerceStrictJsonValue(Number.POSITIVE_INFINITY)).toBeUndefined()
  })

  it('BigInt 返回 undefined', () => {
    expect(coerceStrictJsonValue(123n)).toBeUndefined()
  })

  it('Symbol 返回 undefined', () => {
    expect(coerceStrictJsonValue(Symbol('x'))).toBeUndefined()
  })

  it('循环引用返回 undefined', () => {
    const obj: Record<string, unknown> = { name: 'test' }
    obj['self'] = obj
    expect(coerceStrictJsonValue(obj)).toBeUndefined()
  })

  it('undefined 返回 undefined', () => {
    expect(coerceStrictJsonValue(undefined)).toBeUndefined()
  })

  it('Date 正确转换', () => {
    expect(coerceStrictJsonValue(new Date('2026-05-23T00:00:00.000Z')))
      .toBe('2026-05-23T00:00:00.000Z')
  })

  it('无效 Date 返回 undefined', () => {
    expect(coerceStrictJsonValue(new Date('invalid'))).toBeUndefined()
  })

  it('嵌套非 JSON 安全值导致整体返回 undefined', () => {
    expect(coerceStrictJsonValue({ ok: 1, bad: 123n })).toBeUndefined()
  })
})

// ── ModuleKindRegistry ──────────────────────────────────────

describe('ModuleKindRegistry', () => {
  it('空注册表 list() 返回空数组', () => {
    const registry = new ModuleKindRegistry()
    expect(registry.list()).toEqual([])
  })

  it('register() 后 list/get 可查到', () => {
    const registry = new ModuleKindRegistry()
    const kind = new ModuleKind({ kind: 'test', name: 'Test', description: 'A test kind.' })
    const registered = registry.register(kind)
    expect(registered).toBe(kind)
    expect(registry.list()).toHaveLength(1)
    expect(registry.get('test')).toBe(kind)
  })

  it('register() 支持 ModuleKind subclass 构造器并返回实例', () => {
    class ConstructorRegisteredKind extends ModuleKind {
      public constructor(options: { readonly kind: string; readonly name: string }) {
        super({
          kind: options.kind,
          name: options.name,
          description: 'Registered from constructor.',
        })
      }
    }

    const registry = new ModuleKindRegistry()
    const registered = registry.register(ConstructorRegisteredKind, {
      kind: 'constructor-kind',
      name: 'Constructor Kind',
    })

    expect(registered).toBeInstanceOf(ConstructorRegisteredKind)
    expect(registry.get('constructor-kind')).toBe(registered)
    expect(registry.list()).toEqual([registered])
  })

  it('get() 返回 undefined 当 kind 未注册', () => {
    const registry = new ModuleKindRegistry()
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('重复注册 fail-fast', () => {
    const registry = new ModuleKindRegistry()
    const kind1 = new ModuleKind({ kind: 'dup', name: 'Dup1', description: 'First.' })
    const kind2 = new ModuleKind({ kind: 'dup', name: 'Dup2', description: 'Second.' })
    registry.register(kind1)
    expect(() => registry.register(kind2)).toThrow()
  })
})

// ── KnowledgeProjector ──────────────────────────────────────

function createTestKind(kind: string, name: string, overrides?: {
  parentKind?: string
  children?: readonly string[]
  functions?: ReadonlyArray<{
    name: string
    description: string
    paramsSchema: ReturnType<typeof paramsSchema>
  }>
}): ModuleKind {
  const parentKind = overrides?.parentKind
  return new ModuleKind({
    kind,
    name,
    description: `${name} description.`,
    ...(parentKind === undefined ? {} : { parentKind }),
    children: overrides?.children ?? [],
    functions: overrides?.functions ?? [],
  })
}

describe('ModuleSemanticKnowledgeProjector', () => {
  it('空注册表 project() 返回空模块/函数列表和非空 promptSnapshot', () => {
    const registry = new ModuleKindRegistry()
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    const snapshot = projector.project()
    expect(snapshot.modules).toEqual([])
    expect(snapshot.functions).toEqual([])
    expect(snapshot.kindLayers).toEqual([])
    expect(snapshot.promptSnapshot).toContain('工具：')
  })

  it('queryModules() 无过滤时返回全部注册 kind', () => {
    const registry = new ModuleKindRegistry()
    registry.register(createTestKind('root', 'Root'))
    registry.register(createTestKind('child', 'Child', { parentKind: 'root' }))
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    const modules = projector.queryModules()
    expect(modules).toHaveLength(2)
    expect(modules.map((m) => m.kind).sort()).toEqual(['child', 'root'])
  })

  it('queryModules({ kind }) 精确过滤', () => {
    const registry = new ModuleKindRegistry()
    registry.register(createTestKind('root', 'Root'))
    registry.register(createTestKind('child', 'Child', { parentKind: 'root' }))
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    const modules = projector.queryModules({ kind: 'child' })
    expect(modules).toHaveLength(1)
    expect(modules[0]!.kind).toBe('child')
  })

  it('queryModules({ parentKind: "root" }) 只返回根模块', () => {
    const registry = new ModuleKindRegistry()
    registry.register(createTestKind('root', 'Root'))
    registry.register(createTestKind('child', 'Child', { parentKind: 'root' }))
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    const modules = projector.queryModules({ parentKind: 'root' })
    expect(modules).toHaveLength(1)
    expect(modules[0]!.kind).toBe('root')
  })

  it('queryModules({ keyword }) 按名称模糊匹配', () => {
    const registry = new ModuleKindRegistry()
    registry.register(createTestKind('pageDesign', 'Page Design'))
    registry.register(createTestKind('leaveRequest', 'Leave Request'))
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    const modules = projector.queryModules({ keyword: 'leave' })
    expect(modules).toHaveLength(1)
    expect(modules[0]!.kind).toBe('leaveRequest')
  })

  it('queryFunctions() 汇总所有 kind 的函数', () => {
    const registry = new ModuleKindRegistry()
    registry.register(createTestKind('test', 'Test', {
      functions: [
        { name: 'doA', description: 'Do A.', paramsSchema: paramsSchema({}) },
        { name: 'doB', description: 'Do B.', paramsSchema: paramsSchema({}) },
      ],
    }))
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    const functions = projector.queryFunctions()
    expect(functions).toHaveLength(2)
    expect(functions.map((f) => f.functionName).sort()).toEqual(['doA', 'doB'])
  })

  it('queryFunctions({ kind }) 过滤指定 kind', () => {
    const registry = new ModuleKindRegistry()
    registry.register(createTestKind('a', 'A', {
      functions: [{ name: 'fnA', description: 'A func.', paramsSchema: paramsSchema({}) }],
    }))
    registry.register(createTestKind('b', 'B', {
      functions: [{ name: 'fnB', description: 'B func.', paramsSchema: paramsSchema({}) }],
    }))
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    expect(projector.queryFunctions({ kind: 'a' })).toHaveLength(1)
    expect(projector.queryFunctions({ kind: 'b' })).toHaveLength(1)
  })

  it('queryFunctions({ keyword }) 模糊匹配函数名', () => {
    const registry = new ModuleKindRegistry()
    registry.register(createTestKind('test', 'Test', {
      functions: [
        { name: 'describeProgress', description: 'Progress.', paramsSchema: paramsSchema({}) },
        { name: 'resetAll', description: 'Reset.', paramsSchema: paramsSchema({}) },
      ],
    }))
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    const results = projector.queryFunctions({ keyword: 'progress' })
    expect(results).toHaveLength(1)
    expect(results[0]!.functionName).toBe('describeProgress')
  })

  it('guideFunction({ toolName }) 返回完整指南', () => {
    const registry = new ModuleKindRegistry()
    const kind = createTestKind('test', 'Test', {
      functions: [{
        name: 'doWork',
        description: 'Execute work.',
        paramsSchema: paramsSchema({ input: stringSchema('Work input.') }, ['input']),
      }],
    })
    registry.register(kind)
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    const result = projector.guideFunction({ toolName: 'test_doWork' })
    expect(result.ok).toBe(true)
    if (result.ok && result.data !== undefined) {
      expect(result.data.toolName).toBe('test_doWork')
      expect(result.data.functionName).toBe('doWork')
      expect(result.data.paramsSchema).toBeDefined()
    }
  })

  it('guideFunction({ kind, functionName }) 等价于 toolName 方式', () => {
    const registry = new ModuleKindRegistry()
    registry.register(createTestKind('test', 'Test', {
      functions: [{
        name: 'doWork',
        description: 'Execute work.',
        paramsSchema: paramsSchema({}),
      }],
    }))
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    const result = projector.guideFunction({ kind: 'test', functionName: 'doWork' })
    expect(result.ok).toBe(true)
  })

  it('guideFunction 对未注册 kind 返回 KIND_NOT_REGISTERED', () => {
    const registry = new ModuleKindRegistry()
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    const result = projector.guideFunction({ kind: 'ghost', functionName: 'fn' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.checks?.[0]?.code).toBe('KIND_NOT_REGISTERED')
    }
  })

  it('guideFunction 对未声明函数返回 FUNCTION_NOT_FOUND', () => {
    const registry = new ModuleKindRegistry()
    registry.register(createTestKind('test', 'Test'))
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    const result = projector.guideFunction({ kind: 'test', functionName: 'missing' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.checks?.[0]?.code).toBe('FUNCTION_NOT_FOUND')
    }
  })

  it('guideHumanQuestion 返回结构化反问指南', () => {
    const registry = new ModuleKindRegistry()
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    const result = projector.guideHumanQuestion({
      context: '用户要求修改页面布局',
      reason: '缺少目标页面 ID',
      missingFacts: ['目标页面名称或 ID'],
    })
    expect(result.ok).toBe(true)
    if (result.ok && result.data !== undefined) {
      expect(result.data.shouldAskHuman).toBe(true)
      expect(result.data.stopToolCalls).toBe(true)
      expect(result.data.question).toContain('目标页面名称或 ID')
    }
  })

  it('guideHumanQuestion 对空 context/reason 返回错误', () => {
    const registry = new ModuleKindRegistry()
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    const result = projector.guideHumanQuestion({ context: '', reason: '' })
    expect(result.ok).toBe(false)
  })

  it('project().promptSnapshot 包含注册 kind 的索引行', () => {
    const registry = new ModuleKindRegistry()
    registry.register(createTestKind('pageDesign', 'Page Design'))
    const projector = new ModuleSemanticKnowledgeProjector(registry)
    const snapshot = projector.project()
    expect(snapshot.promptSnapshot).toContain('pageDesign')
    expect(snapshot.promptSnapshot).toContain('工具：')
  })
})
