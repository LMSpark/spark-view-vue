/**
 * 脚本沙箱工具
 */

import { Logger } from '@spark-view/spark-utils'

const pageLogger = Logger('PageRenderer')
import type { PageContext } from '../types'

/**
 * PageContext 中暴露给业务脚本的变量名列表。
 *
 * 新增沙箱变量时只需在此处追加，`compileFunctions` 的实现无需修改。
 */
const SANDBOX_KEYS = [
  '$api',
  '$route',
  '$data',
  '$el',
  '$query',
  '$queryAll',
  '$dataSet',
  '$rebindRules',
  '$refreshData',
  'ElMessage',
  'ElMessageBox',
  'SparkData',
  'h'
] as const satisfies ReadonlyArray<keyof PageContext>

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

    // 使用单一 __ctx 参数解构，避免位置参数膨胀
    const destructure = `const { ${SANDBOX_KEYS.join(', ')} } = __ctx;\n`
    const fullScript = destructure + scriptText + returnStatement

    const func = new Function('__ctx', fullScript)
    const result = (func as (ctx: PageContext) => Record<string, unknown>)(context)

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
    pageLogger.error('脚本执行错误', { error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

