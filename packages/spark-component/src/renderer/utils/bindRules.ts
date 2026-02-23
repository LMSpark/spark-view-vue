/**
 * Rule 数据绑定工具
 */

import { Logger } from '@spark-view/spark-utils'
import type { Rule, RuleBindingOptions } from '../types'
import type { IDataRow, IDataSet } from '@spark-view/spark-data'
import { createTableSyncHandlers } from '@spark-view/spark-data'
import { parseDataKey, resolveRawKey, getViewFromRawKey, isDataKey, resolveDataKeyBinding, bus } from '@spark-view/spark-data'
import { isCurrentlySyncingToUI } from '../composables/useRuleBinding'

const pageLogger = Logger('PageRenderer')

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
 * 解析 DataKey 字符串 → 绑定值（渲染层薄包装，负责 warn 日志）
 *
 * 数据解析逻辑完全委托给 spark-data 的 `resolveRawKey`。
 */
function resolveRuleDataKey(
  rawKey: string,
  dataSet: IDataSet | null
): ReturnType<typeof resolveRawKey> {
  if (!isDataKey(rawKey)) {
    pageLogger.warn(
      `dataKey "${rawKey}" 不是有效的 DataKey 格式（缺少 @），已跳过绑定。` +
      '请使用 scope@tableName@viewId@field 格式，或将值写入 $data 后通过 dataSource/currentKey 绑定。'
    )
    return undefined
  }
  if (!dataSet) return undefined
  return resolveRawKey(rawKey, dataSet)
}

/**
 * 将 dataKey 对应的 DataView 注入到 rule.props.dataView（渲染层薄包装）
 *
 * 视图查找完全委托给 spark-data 的 `getViewFromRawKey`。
 */
function attachDataViewIfDataKey(
  rawKey: string | undefined,
  dataSet: IDataSet | null,
  rule: Rule
): void {
  if (!rawKey || !dataSet) return
  const view = getViewFromRawKey(rawKey, dataSet)
  if (!view) return
  rule.props ??= {}
  rule.props['dataView'] = view
}

/**
 * 递归替换 rule 中的数据占位符和事件处理器
 */
// Note: form-create 的 Rule 类型过于复杂，使用 any[] 作为返回类型避免类型冲突
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bindDataToRules(options: RuleBindingOptions): any[] {
  const { rules, pageData, pageFunctions, dataSet } = options
  
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
    
    // 🎯 处理 dataSource 绑定（r-table, r-tree 共用 —— 脚本写入 pageData 的值）
    if ((newRule.type === 'r-table' || newRule.type === 'r-tree') && newRule['dataSource']) {
      const dataSource = pageData[newRule['dataSource'] as string]
      if (dataSource !== undefined) {
        newRule.props ??= {}
        // 强制绑定为 dataSource（不再向后兼容 props.data）
        newRule.props['dataSource'] = dataSource
      }
    }

    // 🎯 将 dataKey 透传到 props — r-table/r-form/r-detail/r-tree 自行 consume(PAGE_DATASET) 解析
    // el-table 保持旧的外部注入模式（原生组件无法使用 useSparkComponent）
    const selfResolvingTypes = ['r-table', 'r-form', 'r-detail', 'r-tree']
    if (newRule['dataKey'] && selfResolvingTypes.includes(newRule.type as string)) {
      newRule.props ??= {}
      newRule.props['dataKey'] = newRule['dataKey'] as string
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
    
    // 🎯 处理 el-table 的 dataKey 绑定
    if (newRule.type === 'el-table' && newRule['dataKey']) {
      const binding = dataSet
        ? resolveDataKeyBinding(newRule['dataKey'] as string, dataSet)
        : null
      if (binding?.kind === 'view') {
        newRule.props ??= {}
        newRule.props['dataSource'] = binding.source
        newRule.props['dataView'] = binding.source
        // Element Plus el-table 需要 data 属性（响应式数组）
        newRule.props['data'] = binding.source.rows
      }
      // 如果有 dataSet，注入同步事件
      if (dataSet) {
        injectTableEvents(newRule, dataSet)
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
        // Note: bindDataToRules 返回 any[] 类型（form-create 类型系统限制）
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        newRule.children = bindDataToRules({
          rules: childRules,
          pageData,
          pageFunctions,
          dataSet
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
    } catch (error: unknown) {
      pageLogger.error('函数执行错误', { 
        functionName, 
        args, 
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }
}

/**
 * 为 el-table 注入 DataSet 同步事件（UI → DataSet 方向）
 *
 * 为表格的 currentChange 和 selectionChange 事件注入处理器，
 * 将 el-table UI 事件同步写入对应的 DataView。
 *
 * DataSet → UI 方向由 useTableDataSync 单独负责。
 */
function injectTableEvents(
  rule: Rule,
  dataSet: IDataSet
): void {
  // 通过统一 DataKey 解析获取表名和视图ID
  const rawKey = rule['dataKey'] as string | undefined
  if (!rawKey) return

  const dk = parseDataKey(rawKey)
  if (!dk) return  // 非 DataSet 键，无法注入事件

  const { tableName, viewId } = dk
  
  // 添加唯一的 name 属性
  rule.name ??= `table_${tableName}_${viewId}`
  
  // 确保 on 对象存在
  rule.on ??= {}

  // 使用 spark-data 提供的同步写入 API（渲染层不直接操作 table/view 内部）
  const sync = createTableSyncHandlers(dataSet, tableName, viewId)
  
  // 注入 currentChange 事件（单选行变化）
  const originalCurrentChange = rule.on['currentChange']
  rule.on['currentChange'] = (currentRow: IDataRow | null, oldRow: IDataRow | null) => {
    pageLogger.info(`🎯 [TableEvent] currentChange 触发`, { tableName, viewId })
    
    // ✅ 防止 DataSet→UI 同步期间的反向调用（el-table API 副作用）
    if (isCurrentlySyncingToUI()) {
      pageLogger.debug(`⏭️ [防循环] 跳过 el-table API 副作用触发的事件`, { tableName, viewId })
      return
    }
    
    // （本地防重逻辑已移除）
    try {
      // 先调用用户处理器
      if (typeof originalCurrentChange === 'function') {
        (originalCurrentChange as (current: unknown, old: unknown) => void)(currentRow, oldRow)
      }
      
      // 委托 spark-data 同步写入（会从 args[0] 提取干净数据）
      sync.onCurrentChange(currentRow ?? null)
      pageLogger.info(`📝 [TableEvent] 同步 currentRow 到 DataSet.${tableName}.${viewId}`)
      // 同时通过全局事件总线广播（可用于跨组件联动）
      if (currentRow) {
        bus.emit('rowSelected', currentRow)
      }
    } finally {
      // no-op
    }
  }
  
  pageLogger.info(`✅ [TableEvent] 已注入 currentChange 事件处理器`, { tableName, viewId, ruleName: rule.name })
  
  // 注入 selectionChange 事件（多选变化）
  const originalSelectionChange = rule.on['selectionChange']
  rule.on['selectionChange'] = (selection: IDataRow[]) => {
    pageLogger.info(`🎯 [TableEvent] selectionChange 触发`, { tableName, viewId, selectionCount: selection.length })
    
    // ✅ 防止 DataSet→UI 同步期间的反向调用（el-table API 副作用）
    if (isCurrentlySyncingToUI()) {
      pageLogger.debug(`⏭️ [防循环] 跳过 el-table API 副作用触发的事件`, { tableName, viewId })
      return
    }
    
    // （本地防重逻辑已移除）
    try {
      
      // 先调用用户处理器
      if (typeof originalSelectionChange === 'function') {
        (originalSelectionChange as (selection: unknown) => void)(selection)
      }
      
      // 委托 spark-data 同步写入
      sync.onSelectionChange(selection)
      pageLogger.info(`📝 [TableEvent] 同步 selectedRows 到 DataSet.${tableName}.${viewId}`)
    } finally {
      // no-op
    }
  }
}
