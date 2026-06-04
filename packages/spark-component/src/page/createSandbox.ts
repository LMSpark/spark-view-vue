/**
 * 脚本沙箱工具
 */

import { toErrorMessage, createSafeProxy, isCallable, isRecord } from '@spark-appworks/spark-utils'
import type { PageContext } from './context/types'
import { pageLogger } from './services/pageLogger'

/**
 * 从脚本文本中提取所有顶层函数名
 * 匹配：`function foo()`、`async function foo()`、
 *        `const/let/var foo = () =>`、`const/let/var foo = function`、
 *        `const/let/var foo = async () =>`
 */
/** 从文本中按正则分组 1 提取所有匹配名称 */
function collectGroupMatches(text: string, pattern: RegExp, target: Set<string>): void {
  for (const m of text.matchAll(pattern)) if (m[1]) target.add(m[1])
}

function extractNamesFromScript(scriptText: string): string[] {
  const names = new Set<string>()

  // 函数声明：function foo() / async function foo()
  collectGroupMatches(scriptText, /(?:^|\n)\s*(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, names)

  // 变量赋值函数：const/let/var foo = (...) => / function
  collectGroupMatches(scriptText, /(?:^|\n)\s*(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?(?:function|\(|[a-zA-Z_$][a-zA-Z0-9_$]*\s*=>)/g, names)

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
 * 沙箱通过单一 `__ctx` 参数传入 {@link PageContext}，
 * 扩展新变量只需更新 PageContext 接口即可。
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
    // 这样 $dataSet 的 getter 才能正常工作
    // 注意：with 在非严格模式下工作，所以不能在函数内添加 'use strict'
    //
    // ⚠️ returnStatement 必须放在 with 块内部：
    //    async function / generator / class 声明在 with 块内是块作用域的，
    //    不会被提升到外层函数作用域（与普通 function 声明不同）。
    //    将 return 放在 with 块外部会导致这些声明不可见（typeof → 'undefined'）。
    const fullScript = `with (__ctx) { ${scriptText} ${returnStatement}\n}`

    const func = new Function('__ctx', fullScript)
    const safeContext = createSafeProxy(context)
    // Dynamic page scripts intentionally compile through Function; the result is validated below.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const result: unknown = func(safeContext)
    if (!isRecord(result)) return {}

    // 过滤掉 undefined 的函数
    const filteredResult: Record<string, (...args: unknown[]) => unknown> = {}
    for (const [key, value] of Object.entries(result)) {
      if (isCallable(value)) {
        filteredResult[key] = (...args: unknown[]) => value(...args)
      }
    }

    return filteredResult
  } catch (error: unknown) {
    pageLogger.error('脚本执行错误', { error: toErrorMessage(error) })
    throw error
  }
}

