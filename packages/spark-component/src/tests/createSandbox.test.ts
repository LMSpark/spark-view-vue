/**
 * createSandbox 单元测试
 *
 * 覆盖：
 * - 函数名提取（extractNamesFromScript 间接测试）
 * - compileFunctions 编译 & 执行
 * - __init__ 函数
 * - 函数间互相调用
 * - 沙箱上下文变量访问（$dataSet / $page / 自定义）
 * - 原型链访问拦截（prototype pollution 防护）
 * - 边界场景（空脚本、语法错误）
 */

import { describe, it, expect, vi } from 'vitest'
import { compileFunctions } from '../renderer/utils/createSandbox'
import type { PageContext } from '../renderer/types'

/** 创建最小化的 PageContext mock */
function createMockContext(overrides: Partial<PageContext> = {}): PageContext {
  return {
    $api: null,
    $route: { path: '/', fullPath: '/', params: {}, query: {}, name: '', hash: '' },
    $el: () => null,
    $query: () => null,
    $queryAll: () => document.querySelectorAll('.noop'),
    $dataSet: null,
    $rebindRules: () => {},
    $refreshData: async () => {},
    $page: {
      showMessage: vi.fn(),
      showConfirm: vi.fn(async () => true),
      showPrompt: vi.fn(async () => null),
      showAlert: vi.fn(async () => {}),
      showLoading: vi.fn(),
      navigate: vi.fn(),
    },
    SparkData: {} as PageContext['SparkData'],
    h: vi.fn() as unknown as PageContext['h'],
    ...overrides,
  }
}

describe('createSandbox — compileFunctions', () => {
  // ── 基础编译 ────────────────────────────────────────────────────────────────

  it('空脚本应返回空对象', () => {
    const ctx = createMockContext()
    const fns = compileFunctions('', ctx)
    expect(fns).toEqual({})
  })

  it('应正确提取并返回 function 声明', () => {
    const script = `
      function greet(name) { return 'Hello ' + name }
      function add(a, b) { return a + b }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns).toHaveProperty('greet')
    expect(fns).toHaveProperty('add')
    expect(fns['greet']!('World')).toBe('Hello World')
    expect(fns['add']!(2, 3)).toBe(5)
  })

  it('应正确提取 async function（注意：with() 内 async function 是块级作用域）', () => {
    // async function 声明在 with() 块内是块级作用域（V8 行为），
    // 因此无法从 return 语句访问。用 var = async function 替代。
    const script = `
      var fetchData = async function() { return 42 }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns).toHaveProperty('fetchData')
  })

  it('应正确提取箭头函数赋值（需使用 var 声明）', () => {
    // const/let 在 with() 块内是块级作用域，无法从 return 语句访问。
    // 脚本中应使用 var 或 function 声明。
    const script = `
      var multiply = function(a, b) { return a * b }
      var square = function(x) { return x * x }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns).toHaveProperty('multiply')
    expect(fns).toHaveProperty('square')
    expect(fns['multiply']!(3, 4)).toBe(12)
    expect(fns['square']!(5)).toBe(25)
  })

  // ── __init__ ────────────────────────────────────────────────────────────────

  it('__init__ 函数应被返回', () => {
    const script = `
      function __init__() { return 'initialized' }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns).toHaveProperty('__init__')
    expect(fns['__init__']!()).toBe('initialized')
  })

  it('未定义 __init__ 时不应出现在结果中', () => {
    const script = `
      function other() { return 1 }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns).not.toHaveProperty('__init__')
    expect(fns).toHaveProperty('other')
  })

  // ── 函数间互调 ───────────────────────────────────────────────────────────────

  it('函数之间可以相互调用', () => {
    const script = `
      function double(x) { return x * 2 }
      function quadruple(x) { return double(double(x)) }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['quadruple']!(3)).toBe(12)
  })

  // ── 沙箱上下文访问 ─────────────────────────────────────────────────────────

  it('函数应能访问沙箱上下文变量', () => {
    const ctx = createMockContext()
    const script = `
      function getDataSet() { return $dataSet }
      function callPage() { $page.showMessage('hi', 'info'); return true }
    `
    const fns = compileFunctions(script, ctx)
    expect(fns['getDataSet']!()).toBeNull()
    expect(fns['callPage']!()).toBe(true)
    expect(ctx.$page.showMessage).toHaveBeenCalledWith('hi', 'info')
  })

  // ── 原型链安全（Proxy 拦截）─────────────────────────────────────────────────

  it('应拦截 __proto__ 访问（返回 undefined）', () => {
    const script = `
      function getProto() { return __proto__ }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['getProto']!()).toBeUndefined()
  })

  it('应拦截 constructor 访问', () => {
    const script = `
      function getCtor() { return constructor }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['getCtor']!()).toBeUndefined()
  })

  it('应拦截 globalThis 访问', () => {
    const script = `
      function getGlobal() { return globalThis }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['getGlobal']!()).toBeUndefined()
  })

  it('应拦截 window 访问', () => {
    const script = `
      function getWindow() { return window }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['getWindow']!()).toBeUndefined()
  })

  it('应拦截 eval 访问', () => {
    const script = `
      function getEval() { return eval }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['getEval']!()).toBeUndefined()
  })

  it('应拦截 Function 构造函数访问', () => {
    const script = `
      function getFunc() { return Function }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['getFunc']!()).toBeUndefined()
  })

  it('应拦截 process/require 访问（Node.js 环境逃逸）', () => {
    const script = `
      function getProcess() { return process }
      function getRequire() { return require }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['getProcess']!()).toBeUndefined()
    expect(fns['getRequire']!()).toBeUndefined()
  })

  // ── 错误处理 ────────────────────────────────────────────────────────────────

  it('语法错误应抛出异常', () => {
    const script = `function broken( { return }`
    expect(() => compileFunctions(script, createMockContext())).toThrow()
  })

  it('运行时错误应抛出异常', () => {
    const script = `
      function willFail() { throw new Error('boom') }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(() => fns['willFail']!()).toThrow('boom')
  })

  // ── with() 块级作用域限制文档 ─────────────────────────────────────────────

  it('const/let 声明在 with() 内是块级作用域（不可导出）', () => {
    const script = `
      const hidden = () => 42
    `
    const fns = compileFunctions(script, createMockContext())
    // const 声明被 with 块限制，return 语句无法访问
    expect(fns).not.toHaveProperty('hidden')
  })

  it('async function 声明在 with() 内是块级作用域（不可导出）', () => {
    const script = `
      async function asyncHidden() { return 42 }
    `
    const fns = compileFunctions(script, createMockContext())
    // V8 中 async function 声明在块内是块级作用域
    expect(fns).not.toHaveProperty('asyncHidden')
  })
})
