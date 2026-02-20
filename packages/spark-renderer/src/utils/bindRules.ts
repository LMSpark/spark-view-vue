/**
 * Rule 数据绑定工具
 */

import { Logger } from '@spark-view/spark-utils'
import { nextTick } from 'vue'
import type { Rule, RuleBindingOptions, FormCreateAPI } from '../types'
import type { IDataRow, IDataSet } from '@spark-view/spark-data'
import { parseDataKey, resolveDataKey, isDataKey } from '@spark-view/spark-data'

const pageLogger = Logger('PageRenderer')

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
 * 解析 DataKey → DataSet 数据（仅支持 `scope@tableName@viewId@field` 格式）
 *
 * - pagedata.json 数据通过 DataSet + DataKey 访问
 * - 脚本运行时状态（$data）由调用方直接读取 pageData，不经此函数
 * - 非 DataKey 字符串（缺少 @）：打印 warn 并返回 undefined
 */
function resolveRuleDataKey(
  rawKey: string,
  dataSet: IDataSet | null
): unknown {
  if (!isDataKey(rawKey)) {
    pageLogger.warn(
      `dataKey "${rawKey}" 不是有效的 DataKey 格式（缺少 @），已跳过绑定。` +
      '请使用 scope@tableName@viewId@field 格式，或将值写入 $data 后通过 dataSource/currentKey 绑定。'
    )
    return undefined
  }

  if (!dataSet) return undefined
  const dk = parseDataKey(rawKey)
  if (!dk) return undefined

  // rows 字段 → 返回 DataView 实例（结构兼容 IDataSource）
  if (dk.field === 'rows') {
    const table = dataSet.getTable(dk.tableName)
    return table ? dataSet.getView(dk.tableName, dk.viewId) : undefined
  }

  // currentRow / selectedRows → 返回原始值
  return resolveDataKey(dk, dataSet)
}

/**
 * 如果 dataKey 指向 DataSet 的视图，则把对应的 DataView 注入到 rule.props.dataView
 */
function attachDataViewIfDataKey(
  rawKey: string | undefined,
  dataSet: IDataSet | null,
  rule: Rule
): void {
  if (!rawKey || !dataSet || !isDataKey(rawKey)) return
  const dk = parseDataKey(rawKey)
  if (!dk) return
  const view = dataSet.getView(dk.tableName, dk.viewId)
  if (!view) return
  rule.props ??= {}
  rule.props['dataView'] = view
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
      const newOn: Record<string, unknown> = {}
      for (const [eventName, handler] of Object.entries(newRule.on)) {
        if (typeof handler === 'string') {
          // 使用 callFunc 包装，提供运行时检查和扩展能力
          newOn[eventName] = (...args: unknown[]) => callFunc(handler, ...args)
        } else {
          newOn[eventName] = handler
        }
      }
      newRule.on = newOn as Record<string, Function | Function[]>
    }
    
    // 🎯 处理 dataSource 绑定（r-table, r-tree 共用）
    if ((newRule.type === 'r-table' || newRule.type === 'r-tree') && newRule['dataSource']) {
      const dataSource = pageData[newRule['dataSource'] as string]
      if (dataSource !== undefined) {
        newRule.props ??= {}
        // 强制绑定为 dataSource（不再向后兼容 props.data）
        newRule.props['dataSource'] = dataSource
      }
    }

    // 🎯 处理 r-tree 的 dataKey 绑定（用于 default-expanded-keys）
    if (newRule.type === 'r-tree' && newRule['dataKey']) {
      const resolved = resolveRuleDataKey(newRule['dataKey'] as string, dataSet)
      if (resolved !== undefined && Array.isArray(resolved)) {
        newRule.props ??= {}
        newRule.props['default-expanded-keys'] = resolved
      }

      // 同时注入 DataView（若是 DataKey）
      attachDataViewIfDataKey(newRule['dataKey'] as string | undefined, dataSet, newRule)
    }

    // 🎯 处理 r-tree 的 currentKey 绑定（用于 current-key 高亮）
    if (newRule.type === 'r-tree' && newRule['currentKey']) {
      const keys = (newRule['currentKey'] as string).split('.')
      const value = getNestedValue<string | number>(pageData, keys)
      if (value !== undefined) {
        newRule.props ??= {}
        newRule.props['current-key'] = value
      }
    }

    // 🎯 处理 props 中的事件处理函数（针对自定义组件，如 r-tree）
    if (newRule.props && typeof newRule.props === 'object') {
      for (const [propName, propValue] of Object.entries(newRule.props)) {
        // 检测以 "on" 开头的 prop（如 onNodeClick）
        if (propName.startsWith('on') && typeof propValue === 'string') {
          // 将字符串函数名转换为实际的函数调用
          newRule.props[propName] = (...args: unknown[]) => callFunc(propValue, ...args)
        }
      }
    }
    
    // 🎯 处理 dataKey → props.data 绑定（r-form, r-detail 共用）
    if ((newRule.type === 'r-form' || newRule.type === 'r-detail') && newRule['dataKey']) {
      const resolved = resolveRuleDataKey(newRule['dataKey'] as string, dataSet)
      if (resolved !== undefined) {
        newRule.props ??= {}
        newRule.props['data'] = resolved
      }
      // 注入 DataView 实例（如果 dataKey 指向 DataSet）
      attachDataViewIfDataKey(newRule['dataKey'] as string | undefined, dataSet, newRule)    }
    
    // 🎯 处理 el-table 的 dataKey 绑定
    if (newRule.type === 'el-table' && newRule['dataKey']) {
      const resolved = resolveRuleDataKey(newRule['dataKey'] as string, dataSet)
      if (resolved !== undefined) {
        newRule.props ??= {}

        // 严格要求：只绑定 props.dataSource（若解析到 DataView/IDataSource）
        if (resolved && typeof resolved === 'object' && 'rows' in (resolved as Record<string, unknown>)) {
          const ds = resolved as import('@spark-view/spark-data').IDataSource
          newRule.props['dataSource'] = ds
        } else {
          // 非 IDataSource 的解析结果不再绑定到 el-table（删除兼容 props.data）
          // 留空以便用户修正 dataKey 或确保 pageData 已归一化为 DataSet
        }

        // 注入 DataView（如果 dataKey 指向 DataSet）
        attachDataViewIfDataKey(newRule['dataKey'] as string | undefined, dataSet, newRule)
      }

      // 如果有 dataSet，注入同步事件
      if (dataSet) {
        injectTableEvents(newRule, dataSet, formApi)
      }
    }
    
    // 🎯 处理普通元素的 dataKey 绑定（文本内容绑定或表单值绑定）
    // 排除已有专门处理逻辑的容器组件
    const handledTypes = ['el-table', 'r-table', 'r-form', 'r-detail', 'r-tree']
    if (newRule['dataKey'] && !handledTypes.includes(newRule.type as string)) {
      const resolved = resolveRuleDataKey(newRule['dataKey'] as string, dataSet)
      
      // 注入 DataView（若 dataKey 指向 DataSet）
      attachDataViewIfDataKey(newRule['dataKey'] as string | undefined, dataSet, newRule)

      // 如果有值，根据元素类型决定绑定方式
      if (resolved !== undefined && resolved !== null) {
        // 表单元素：绑定到 props.modelValue（支持响应式）
        if (newRule.type === 'el-input' || newRule.type === 'el-textarea') {
          newRule.props ??= {}
          newRule.props['modelValue'] = resolved
        } else {
          // 普通元素：将值转换为字符串并设置为 children
          newRule.children = [String(resolved)]
        }
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
  pageFunctions: Record<string, (...args: unknown[]) => unknown>
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
        error: error instanceof Error ? error : String(error)
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
  
  // 通过统一 DataKey 解析获取表名和视图ID
  const rawKey = rule['dataKey'] as string | undefined
  if (!rawKey) return

  let tableName: string
  let viewId: string

  const dk = parseDataKey(rawKey)
  if (dk) {
    tableName = dk.tableName
    viewId = dk.viewId
  } else {
    // 非 DataSet 键，无法注入事件
    return
  }
  
  // 添加唯一的 name 属性
  rule.name ??= `table_${tableName}_${viewId}`
  
  // 确保 on 对象存在
  rule.on ??= {}
  
  // 注入 currentChange 事件（单选行变化）
  const originalCurrentChange = rule.on['currentChange']
  rule.on['currentChange'] = (currentRow: IDataRow | null, oldRow: IDataRow | null) => {
    pageLogger.info(`🎯 [TableEvent] currentChange 触发`, { tableName, viewId, currentRow, oldRow})
    
    if (isProcessingEvent) return
    
    try {
      isProcessingEvent = true
      
      // 先调用用户处理器
      if (typeof originalCurrentChange === 'function') {
        (originalCurrentChange as (current: unknown, old: unknown) => void)(currentRow, oldRow)
      }
      
      // 同步到 DataSet — 通过公共 API
      const table = dataSet.getTable(tableName)
      if (table) {
        const view = table.getOrCreateView(viewId)
        view.setCurrentRow(currentRow ?? null)
        pageLogger.info(`📝 [TableEvent] 同步 currentRow 到 DataSet.${tableName}.${viewId}`)
      } else {
        pageLogger.warn(`⚠️ [TableEvent] DataSet 表不存在`, { tableName })
      }
    } finally {
      isProcessingEvent = false
    }
  }
  
  pageLogger.info(`✅ [TableEvent] 已注入 currentChange 事件处理器`, { tableName, viewId, ruleName: rule.name })
  
  // 注入 selectionChange 事件（多选变化）
  const originalSelectionChange = rule.on['selectionChange']
  rule.on['selectionChange'] = (selection: IDataRow[]) => {
    pageLogger.info(`🎯 [TableEvent] selectionChange 触发`, { tableName, viewId, selectionCount: selection.length })
    
    if (isProcessingEvent) return
    
    try {
      isProcessingEvent = true
      
      // 先调用用户处理器
      if (typeof originalSelectionChange === 'function') {
        (originalSelectionChange as (selection: unknown) => void)(selection)
      }
      
      // 同步到 DataSet — 通过公共 API
      const table = dataSet.getTable(tableName)
      if (table) {
        const view = table.getOrCreateView(viewId)
        view.setSelectedRows(selection)
        pageLogger.info(`📝 [TableEvent] 同步 selectedRows 到 DataSet.${tableName}.${viewId}`)
      }
    } finally {
      isProcessingEvent = false
    }
  }
}

/**
 * 同步 DataSet 选中状态到 el-table
 */
export function syncSelectedRowsToTable(
  tableName: string,
  viewId: string,
  rows: IDataRow[],
  formApi: FormCreateAPI | null
): void {
  void nextTick(() => {
    if (formApi && typeof formApi.el === 'function') {
      const componentName = `table_${tableName}_${viewId}`
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
