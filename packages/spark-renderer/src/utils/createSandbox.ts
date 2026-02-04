/**
 * 脚本沙箱工具
 */

import { Logger } from '@spark-view/spark-utils'

const pageLogger = Logger('PageRenderer')
import type { PageContext } from '../types'

/**
 * 编译业务脚本为可执行的函数对象
 * 
 * 策略：统一编译所有函数（支持函数间相互调用），但只返回需要的函数
 * 
 * @param scriptText - 业务脚本文本（纯函数定义）
 * @param context - 页面上下文
 * @param functionNames - 需要返回的函数名称数组
 * @returns 编译后的函数对象（只包含需要的函数）
 * 
 * @example
 * ```javascript
 * // 脚本内容：
 * function handleClick(event) {
 *   helper() // 调用辅助函数
 * }
 * 
 * function helper() {
 *   console.log('helper')
 * }
 * 
 * async function loadData() {
 *   const items = await fetch('/api')
 *   $data.items = items
 * }
 * 
 * // 调用：
 * const code = compileFunctions(script, context, ['handleClick', 'loadData'])
 * // 返回: { handleClick: Function, loadData: Function }
 * // helper 不返回，但在 handleClick 内部可以调用
 * ```
 */
export function compileFunctions(
  scriptText: string,
  context: PageContext,
  functionNames: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
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
    const result = func(
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
    const filteredResult: Record<string, Function> = {}
    if (result) {
      for (const key of Object.keys(result)) {
        if (result[key] !== undefined) {
          filteredResult[key] = result[key]
        }
      }
    }
    
    return filteredResult
  } catch (error) {
    pageLogger.error('脚本执行错误', { error })
    throw error
  }
}
