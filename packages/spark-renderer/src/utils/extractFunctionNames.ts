/**
 * 从 Rules 中提取需要的函数名
 */

import type { Rule } from '../types'

/**
 * 递归扫描 rules，提取所有事件处理器函数名和自定义渲染函数名
 * 
 * @param rules - 规则数组
 * @returns 函数名集合
 * 
 * @example
 * ```typescript
 * const rules = [
 *   { type: 'button', on: { click: 'handleClick' } },
 *   { type: 'RenderCustom' },
 *   { children: [{ on: { change: 'handleChange' } }] }
 * ]
 * 
 * const names = extractFunctionNames(rules)
 * // Set(['handleClick', 'RenderCustom', 'handleChange'])
 * ```
 */
export function extractFunctionNames(rules: Rule[]): Set<string> {
  const functionNames = new Set<string>()
  
  const scanRule = (rule: Rule) => {
    if (!rule) return
    
    // 1. 提取自定义渲染函数（Render* 类型）
    if (typeof rule.type === 'string' && rule.type.startsWith('Render')) {
      functionNames.add(rule.type)
    }
    
    // 2. 提取事件处理器函数名
    if (rule.on && typeof rule.on === 'object') {
      for (const handler of Object.values(rule.on)) {
        if (typeof handler === 'string' && handler) {
          functionNames.add(handler)
        }
      }
    }
    
    // 3. 递归扫描子元素
    if (rule.children && Array.isArray(rule.children)) {
      rule.children.forEach((child: unknown) => {
        if (typeof child === 'object' && child !== null) {
          scanRule(child as Rule)
        }
      })
    }
    
    // 4. 递归扫描嵌套的规则数组（某些组件可能用 rules 属性）
    const ruleWithNested = rule as Rule & { rules?: Rule[] }
    if (ruleWithNested.rules && Array.isArray(ruleWithNested.rules)) {
      ruleWithNested.rules.forEach((r: Rule) => scanRule(r))
    }
  }
  
  rules.forEach(rule => scanRule(rule))
  
  return functionNames
}

/**
 * 获取需要编译的完整函数名列表
 * 
 * @param rules - 规则数组
 * @param additionalNames - 额外需要的函数名（如 __init__）
 * @returns 函数名数组
 */
export function getRequiredFunctionNames(
  rules: Rule[],
  additionalNames: string[] = ['__init__']
): string[] {
  const rulesNames = extractFunctionNames(rules)
  const required = new Set<string>(rulesNames)
  
  // 添加特殊函数
  for (const name of additionalNames) {
    required.add(name)
  }
  
  return Array.from(required)
}
