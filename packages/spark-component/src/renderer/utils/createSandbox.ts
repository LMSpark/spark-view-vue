/**
 * 脚本沙箱工具
 */

import { Logger, toErrorMessage } from '@spark-view/spark-utils'
import type { PageContext } from '../types'

const pageLogger = Logger('PageRenderer')

/** 拦截原型链访问的危险属性，防止 `with()` 沙箱逃逸 */
const BLOCKED_KEYS = new Set<string | symbol>([
  '__proto__', 'constructor', 'prototype',
  'globalThis', 'window', 'self', 'top', 'parent', 'frames',
  'document', 'location', 'eval', 'Function',
  'process', 'require', 'module', 'exports', 'global',
])

/**
 * 创建安全的沙箱代理——拦截 `with(__ctx)` 中的属性查找。
 * - `has` 对 BLOCKED_KEYS 返回 true（配合 get 返回 undefined），阻止原型链逃逸
 * - `has` 对目标对象上存在的属性返回 true，正常解析上下文变量
 * - `has` 对其他属性返回 false，允许 `with` 作用域链回退到全局（Error/Array/console 等安全内建对象）
 */
function createSafeProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    has(t, key) {
      // 危险键：拦截并通过 get 返回 undefined
      if (typeof key === 'string' && BLOCKED_KEYS.has(key)) return true
      // 目标上存在的属性：正常解析
      return Reflect.has(t, key)
    },
    get(t, key, receiver) {
      if (key === Symbol.unscopables) return undefined
      if (typeof key === 'string' && BLOCKED_KEYS.has(key)) return undefined
      return Reflect.get(t, key, receiver) as unknown
    },
    set(t, key, value) {
      if (typeof key === 'string' && BLOCKED_KEYS.has(key)) return false
      return Reflect.set(t, key, value)
    },
  })
}

/**
 * 从脚本文本中提取所有顶层函数名
 * 匹配：`function foo()`、`async function foo()`、
 *        `const/let/var foo = () =>`、`const/let/var foo = function`、
 *        `const/let/var foo = async () =>`
 */
function extractNamesFromScript(scriptText: string): string[] {
  const names = new Set<string>()

  // 函数声明：function foo() / async function foo()
  const fnDecl = /(?:^|\n)\s*(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g
  for (const m of scriptText.matchAll(fnDecl)) if (m[1]) names.add(m[1])

  // 变量赋值函数：const/let/var foo = (...) => / function
  const varFn = /(?:^|\n)\s*(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?(?:function|\(|[a-zA-Z_$][a-zA-Z0-9_$]*\s*=>)/g
  for (const m of scriptText.matchAll(varFn)) if (m[1]) names.add(m[1])

  // 始终包含 __init__（即使脚本未定义，compileFunctions 会过滤掉 undefined）
  names.add('__init__')

  return Array.from(names)
}

/**
 * 编译业务脚本为可执行的函数对象
 *
 * 自动扫描脚本文本中所有顶层函数声明和箭头函数赋值，无需调用方预先提供函数名列表。
 * 所有函数都在同一作用域内编译（支持相互调用），只返回实际存在的函数。
 *
 * 沙箱通过单一 `__ctx` 参数传入 {@link PageContext}，扩展新变量只需更新
 * {@link SANDBOX_KEYS} 数组，无需同时修改函数参数和调用点。
 *
 * @param scriptText - 业务脚本文本（纯函数定义）
 * @param context    - 页面上下文
 * @returns 编译后的函数对象
 */
export function compileFunctions(
  scriptText: string,
  context: PageContext
): Record<string, (...args: unknown[]) => unknown> {
  const functionNames = extractNamesFromScript(scriptText)
  try {
    const returnStatement = functionNames.length > 0
      ? `\nreturn { ${functionNames.map(n =>
          `'${n}': (typeof ${n} !== 'undefined' ? ${n} : undefined)`
        ).join(', ')} }`
      : '\nreturn {}'

    // ✅ 使用 with 语句创建动态作用域，让变量每次访问都从 __ctx 获取最新值
    // 这样 $api 和 $dataSet 的 getter 才能正常工作
    // 注意：with 在非严格模式下工作，所以不能在函数内添加 'use strict'
    const fullScript = `with (__ctx) { ${scriptText} }${returnStatement}`

    const func = new Function('__ctx', fullScript)
    const safeContext = createSafeProxy(context)
    const result = (func as (ctx: PageContext) => Record<string, unknown>)(safeContext)

    // 过滤掉 undefined 的函数
    const filteredResult: Record<string, (...args: unknown[]) => unknown> = {}
    if (result) {
      for (const key of Object.keys(result)) {
        if (result[key] !== undefined) {
          filteredResult[key] = result[key] as (...args: unknown[]) => unknown
        }
      }
    }

    return filteredResult
  } catch (error: unknown) {
    pageLogger.error('脚本执行错误', { error: toErrorMessage(error) })
    throw error
  }
}

