/**
 * Rule 数据绑定工具
 */

import { Logger } from '@spark-view/spark-utils'
import type { Rule, RuleBindingOptions, FormCreateAPI } from '../types'
import type { IDataRow, IDataSet } from '@spark-view/spark-data'

const pageLogger = Logger('PageRenderer')
import { nextTick } from 'vue'

/**
 * ElementPlus Table 组件接口
 */
interface ElTableComponent extends HTMLElement {
  clearSelection?: () => void
  toggleRowSelection?: (row: IDataRow, selected: boolean) => void
}

/**
 * 类型安全的嵌套值获取函数
 * @param obj - 源对象
 * @param path - 路径数组（如 ['dataset', 'tables', 'Users', 'rows']）
 * @returns 获取的值，如果路径无效则返回 undefined
 */
function getNestedValue<T = unknown>(
  obj: Record<string, unknown>,
  path: string[]
): T | undefined {
  let current: unknown = obj
  
  for (const key of path) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  
  // 最终结果无法静态验证类型，需要运行时断言
  return current as T
}

/**
 * 递归替换 rule 中的数据占位符和事件处理器
 */
export function bindDataToRules(options: RuleBindingOptions): Rule[] {
  const { rules, pageData, pageFunctions, dataSet, formApi } = options
  
  // 创建统一的函数调用包装器
  const callFunc = createFunctionCaller(pageFunctions)
  
  return rules.map(rule => {
    const newRule = { ...rule }
    
    // 🎯 处理自定义渲染函数（以 Render 开头的 type）
    if (typeof newRule.type === 'string' && newRule.type.startsWith('Render')) {
      const renderFn = pageFunctions[newRule.type]
      if (typeof renderFn === 'function') {
        return {
          type: 'div',
          render: renderFn
        } as Rule
      }
    }
    
    // 处理事件处理器：通过 callFunc 包装
    if (newRule.on && typeof newRule.on === 'object') {
      const newOn: Record<string, Function | Function[]> = {}
      for (const [eventName, handler] of Object.entries(newRule.on)) {
        if (typeof handler === 'string') {
          // 使用 callFunc 包装，提供运行时检查和扩展能力
          newOn[eventName] = (...args: unknown[]) => callFunc(handler, ...args)
        } else {
          newOn[eventName] = handler
        }
      }
      newRule.on = newOn
    }
    
    // 🎯 处理 el-table 的 dataKey 绑定
    if (newRule.type === 'el-table' && newRule.dataKey) {
      // 解析 dataKey 路径，获取数据
      const keys = (newRule.dataKey as string).split('.')
      const value = getNestedValue<unknown[]>(pageData, keys)
      
      // 绑定数据到 props.data
      if (value !== undefined) {
        newRule.props ??= {}
        newRule.props.data = value
      }
      
      // 如果有 dataSet，注入同步事件
      if (dataSet) {
        injectTableEvents(newRule, dataSet, formApi)
      }
    }
    
    // 🎯 处理普通元素的 dataKey 绑定（文本内容绑定）
    if (newRule.dataKey && newRule.type !== 'el-table') {
      // 解析 dataKey 路径，获取数据值
      const keys = (newRule.dataKey as string).split('.')
      const value = getNestedValue<string | number>(pageData, keys)
      
      // 如果有值，替换 children 内容
      if (value !== undefined && value !== null) {
        // 将值转换为字符串并设置为 children
        newRule.children = [String(value)]
      }
    }
    
    // 递归处理子元素
    if (newRule.children && Array.isArray(newRule.children)) {
      const childRules = newRule.children.filter(
        (child: unknown): child is Rule => typeof child !== 'string'
      )
      if (childRules.length > 0) {
        newRule.children = bindDataToRules({
          rules: childRules,
          pageData,
          pageFunctions,
          dataSet,
          formApi
        })
      }
    }
    
    return newRule
  })
}

/**
 * 创建统一的函数调用器
 * 
 * 优势：
 * 1. 运行时检查函数是否存在
 * 2. 统一的错误处理和日志
 * 3. 可扩展：bind、拦截、性能监控等
 * 4. 调试友好：清晰的调用栈
 */
function createFunctionCaller(
  pageFunctions: Record<string, Function>
): (functionName: string, ...args: unknown[]) => unknown {
  return function callFunc(functionName: string, ...args: unknown[]): unknown {
    try {
      // 检查函数是否存在
      const func = pageFunctions[functionName]
      
      if (typeof func !== 'function') {
        pageLogger.warn('函数未定义或不可调用', { 
          functionName,
          type: typeof func,
          available: Object.keys(pageFunctions)
        })
        return undefined
      }
      
      // 调用函数（可在此处添加：bind、拦截、性能监控等）
      const result = (func as (...args: unknown[]) => unknown)(...args)
      
      // 可选：添加调试日志
      // pageLogger.debug('函数调用', { functionName, args, result })
      
      return result
    } catch (error) {
      pageLogger.error('函数执行错误', { 
        functionName, 
        args, 
        error 
      })
      throw error
    }
  }
}

/**
 * 为 el-table 注入 DataSet 同步事件
 */
function injectTableEvents(
  rule: Rule,
  dataSet: IDataSet,
  _formApi: FormCreateAPI | null
): void {
  // 使用局部防重入标志
  let isProcessingEvent = false
  // 解析 dataKey 获取表名
  if (!rule.dataKey) return
  const dataKeyParts = (rule.dataKey as string).split('.')
  const tablesIndex = dataKeyParts.indexOf('tables')
  if (tablesIndex === -1 || !dataKeyParts[tablesIndex + 1]) return
  
  const tableName = dataKeyParts[tablesIndex + 1] as string
  const contextId = ((rule as { contextId?: string }).contextId ?? rule.props?.contextId ?? 'default') as string
  
  // 添加唯一的 name 属性
  rule.name ??= `table_${tableName}_${contextId}`
  
  // 确保 on 对象存在
  rule.on ??= {}
  
  // 注入 currentChange 事件（单选行变化）
  const originalCurrentChange = rule.on['currentChange']
  rule.on['currentChange'] = (currentRow: IDataRow | null, oldRow: IDataRow | null) => {
    if (isProcessingEvent) return
    
    try {
      isProcessingEvent = true
      
      // 先调用用户处理器
      if (typeof originalCurrentChange === 'function') {
        (originalCurrentChange as (current: unknown, old: unknown) => void)(currentRow, oldRow)
      }
      
      // 同步到 DataSet
      if (dataSet?.tables?.[tableName] && contextId) {
        const table = dataSet.tables[tableName] as { contexts?: Record<string, { setCurrentRow?: (row: unknown, notify?: boolean) => void }> }
        const context = table?.contexts?.[String(contextId)]
        if (context?.setCurrentRow) {
          context.setCurrentRow(currentRow ?? null, false)
        }
      }
    } finally {
      isProcessingEvent = false
    }
  }
  
  // 注入 selectionChange 事件（多选变化）
  const originalSelectionChange = rule.on['selectionChange']
  rule.on['selectionChange'] = (selection: IDataRow[]) => {
    if (isProcessingEvent) return
    
    try {
      isProcessingEvent = true
      
      // 先调用用户处理器
      if (typeof originalSelectionChange === 'function') {
        (originalSelectionChange as (selection: unknown) => void)(selection)
      }
      
      // 同步到 DataSet
      if (dataSet?.tables?.[tableName] && contextId) {
        const table = dataSet.tables[tableName] as { contexts?: Record<string, { setSelectedRows?: (rows: unknown, notify?: boolean) => void }> }
        const context = table?.contexts?.[String(contextId)]
        if (context?.setSelectedRows) {
          context.setSelectedRows(selection, true)
        }
      }
    } finally {
      isProcessingEvent = false
    }
  }
}

/**
 * 查找具有特定 dataKey 的 rule
 */
export function findRuleByDataKey(rules: Rule[], dataKey: string): Rule | null {
  for (const rule of rules) {
    if (rule.dataKey === dataKey) {
      return rule
    }
    if (rule.children && Array.isArray(rule.children)) {
      const childRules = rule.children.filter(
        (child: unknown): child is Rule => typeof child !== 'string'
      )
      const found = findRuleByDataKey(childRules, dataKey)
      if (found) return found
    }
  }
  return null
}

/**
 * 同步 DataSet 选中状态到 el-table
 */
export function syncSelectedRowsToTable(
  tableName: string,
  contextId: string,
  rows: IDataRow[],
  formApi: FormCreateAPI | null
): void {
  void nextTick(() => {
    if (formApi && typeof formApi.el === 'function') {
      const componentName = `table_${tableName}_${contextId}`
      const tableComponent = formApi.el(componentName) as ElTableComponent | null
      
      if (tableComponent) {
        if (rows.length === 0 && typeof tableComponent.clearSelection === 'function') {
          tableComponent.clearSelection()
        } else if (typeof tableComponent.toggleRowSelection === 'function') {
          tableComponent.clearSelection?.()
          rows.forEach(row => {
            tableComponent.toggleRowSelection?.(row, true)
          })
        }
      }
    }
  })
}
