/**
 * 脚本沙箱工具
 */

import { Logger } from '@spark-view/spark-utils'

const pageLogger = Logger('PageRenderer')
import type { PageContext } from '../types'

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
 * @param scriptText - 业务脚本文本（纯函数定义）
 * @param context    - 页面上下文
 * @returns 编译后的函数对象
 *
 * @example
 * ```javascript
 * // 脚本内容：
 * function handleClick(event) { helper() }
 * function helper() { console.log('helper') }
 * async function loadData() { $data.items = await fetch('/api') }
 *
 * // 调用：
 * const fns = compileFunctions(script, context)
 * // 返回: { handleClick: Function, helper: Function, loadData: Function, ... }
 * ```
 */
export function compileFunctions(
  scriptText: string,
  context: PageContext
): Record<string, (...args: unknown[]) => unknown> {
  const functionNames = extractNamesFromScript(scriptText)
  try {
    // 构造 return 语句 - 只返回存在的函数（使用 typeof 检查）
    const returnStatement = functionNames.length > 0
      ? `\nreturn { ${functionNames.map(name => 
          `'${name}': (typeof ${name} !== 'undefined' ? ${name} : undefined)`
        ).join(', ')} }`
      : '\nreturn {}'
    
    // 完整脚本 = 原脚本（定义所有函数）+ return 语句（只返回需要的）
    const fullScript = scriptText + returnStatement
    
    // 使用 Function 构造器创建沙箱函数
    const func = new Function(
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
      'h',
      fullScript
    )
    
    // 执行函数，传入上下文参数，返回函数对象
    const result = (func as (api: unknown, route: unknown, data: unknown, el: unknown, query: unknown, queryAll: unknown, dataSet: unknown, rebind: unknown, refresh: unknown, msg: unknown, msgBox: unknown, sparkData: unknown, h: unknown) => Record<string, unknown>)(
      context.$api,
      context.$route,
      context.$data,
      context.$el,
      context.$query,
      context.$queryAll,
      context.$dataSet,
      context.$rebindRules,
      context.$refreshData,
      context.ElMessage,
      context.ElMessageBox,
      context.SparkData,
      context.h
    )
    
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
