/**
 * Rule 数据绑定工具
 */

import { pageLogger } from '@spark-view/spark-app'
import type { Rule, RuleBindingOptions, FormCreateAPI } from '../types'
import type { DataRow, IDataSet, BindingContext } from '@spark-view/spark-data'
import { nextTick } from 'vue'

/**
 * ElementPlus Table 组件接口
 */
interface ElTableComponent extends HTMLElement {
  clearSelection?: () => void
  toggleRowSelection?: (row: DataRow, selected: boolean) => void
}

/**
 * 递归替换 rule 中的数据占位符和事件处理器
 */
export function bindDataToRules(options: RuleBindingOptions): Rule[] {
  const { rules, pageData, pageFunctions, dataSet, formApi } = options
  
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
    
    // 处理事件处理器：将字符串转换为函数引用
    if (newRule.on && typeof newRule.on === 'object') {
      const newOn: Record<string, Function | Function[]> = {}
      for (const [eventName, handler] of Object.entries(newRule.on)) {
        if (typeof handler === 'string') {
          // 直接从 code 对象中获取函数引用
          const fn = pageFunctions[handler]
          if (typeof fn === 'function') {
            newOn[eventName] = fn  // 直接绑定函数引用
          } else {
            pageLogger.warn('函数未定义', { handler })
            newOn[eventName] = () => {}  // 空函数避免报错
          }
        } else {
          newOn[eventName] = handler as Function | Function[]
        }
      }
      newRule.on = newOn
    }
    
    // 自动为 el-table 注入状态同步事件
    if (newRule.type === 'el-table' && newRule.dataKey && dataSet) {
      injectTableEvents(newRule, dataSet, formApi)
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
  const dataKeyParts = rule.dataKey.split('.')
  const tablesIndex = dataKeyParts.indexOf('tables')
  if (tablesIndex === -1 || !dataKeyParts[tablesIndex + 1]) return
  
  const tableName = dataKeyParts[tablesIndex + 1]
  const contextId = (rule as Rule & { contextId?: string }).contextId || rule.props?.contextId || 'default'
  
  // 添加唯一的 name 属性
  if (!rule.name) {
    rule.name = `table_${tableName}_${contextId}`
  }
  
  // 确保 on 对象存在
  if (!rule.on) {
    rule.on = {}
  }
  
  // 注入 currentChange 事件（单选行变化）
  const originalCurrentChange = rule.on['currentChange']
  rule.on['currentChange'] = (currentRow: DataRow | null, oldRow: DataRow | null) => {
    if (isProcessingEvent) return
    
    try {
      isProcessingEvent = true
      
      // 先调用用户处理器
      if (originalCurrentChange && typeof originalCurrentChange === 'function') {
        originalCurrentChange(currentRow, oldRow)
      }
      
      // 同步到 DataSet
      if (dataSet && dataSet.tables && tableName && contextId) {
        const table = dataSet.tables[tableName]
        const context = table?.contexts?.[String(contextId)] as BindingContext | undefined
        if (context?.setCurrentRow) {
          context.setCurrentRow(currentRow || null, false)
        }
      }
    } finally {
      isProcessingEvent = false
    }
  }
  
  // 注入 selectionChange 事件（多选变化）
  const originalSelectionChange = rule.on['selectionChange']
  rule.on['selectionChange'] = (selection: DataRow[]) => {
    if (isProcessingEvent) return
    
    try {
      isProcessingEvent = true
      
      // 先调用用户处理器
      if (originalSelectionChange && typeof originalSelectionChange === 'function') {
        originalSelectionChange(selection)
      }
      
      // 同步到 DataSet
      if (dataSet && dataSet.tables && tableName && contextId) {
        const table = dataSet.tables[tableName]
        const context = table?.contexts?.[String(contextId)] as BindingContext | undefined
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
  rows: DataRow[],
  formApi: FormCreateAPI | null
): void {
  nextTick(() => {
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
