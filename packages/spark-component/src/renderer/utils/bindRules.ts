import { Logger } from '@spark-view/spark-utils'
import type { Rule, RuleBindingOptions } from '../types'
import type { IDataRow, IDataSet } from '@spark-view/spark-data'
import { parseDataKey, resolveRawKey, getViewFromRawKey, isDataKey, resolveDataKeyBinding } from '@spark-view/spark-data'
import type { ComponentRegistry } from '../../core/types.js'

const pageLogger = Logger('PageRenderer')

/**
 * dataKey 自解析组件类型回退默认列表
 *
 * 当组件没有在注册表中声明 meta.dataKey 时，回退到此硬编码列表。
 * 尶内置 SPARK r-* 组件实现后，将在注册时明硬声明 meta.dataKey: 'self-resolve'，则可移除此列表。
 */
const _SELF_RESOLVING_FALLBACK = new Set(['r-table', 'r-form', 'r-detail', 'r-tree'])

/**
 * 检查组件是否为自解析类型（优先查询注册表 meta，回退到核心列表）
 *
 * - 注册表已有该组件且声明了 meta.dataKey 时：以 meta.dataKey 为准
 * - 如果未注册或无 meta.dataKey：回退到内置列表（兼容暂未实现的 r-* 组件）
 */
function isSelfResolvingType(type: string, registry?: ComponentRegistry): boolean {
  if (registry?.has(type)) {
    const behavior = registry.get(type)?.meta?.['dataKey'] as string | undefined
    if (behavior !== undefined) return behavior === 'self-resolve'
  }
  return _SELF_RESOLVING_FALLBACK.has(type)
}

/**
 * 检查组件 dataKey 是否已有专用处理逻辑（排除默认绑定逻辑）
 *
 * - el-table：始终有专用注入块（外部组件，不在注册表中）
 * - 自解析组件：自行解析 dataKey，无需默认绑定
 */
function isDataKeyHandledType(type: string, registry?: ComponentRegistry): boolean {
  return type === 'el-table' || isSelfResolvingType(type, registry)
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
 * 安全设置 rule.props（初始化后赋值，避免重复 ??=）
 */
function setRuleProp(rule: Rule, key: string, value: unknown): void {
  rule.props ??= {}
  rule.props[key] = value
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
  setRuleProp(rule, 'dataView', view)
}

/**
 * 递归替换 rule 中的数据占位符和事件处理器
 */
// Note: form-create 的 Rule 类型过于复杂，使用 any[] 作为返回类型避免类型冲突
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bindDataToRules(options: RuleBindingOptions): any[] {
  const { rules, pageData, pageFunctions, dataSet, registry } = options
  
  // 创建统一的函数调用包装器
  const callFunc = createFunctionCaller(pageFunctions)
  
  return rules.map(rule => {
    const newRule = { ...rule }
    
    // 🎯 处理自定义渲染函数（以 Render 开头的 type）
    // Render* 组件已由 usePageRenderer 通过 app.component() 注册为响应式 Vue 组件
    // 此处保持字符串 type 不变，form-create 会从 Vue 全局组件注册表中解析
    if (typeof newRule.type === 'string' && newRule.type.startsWith('Render')) {
      return newRule as Rule
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



    // 🎯 select / radio 组件特殊处理：如果自身 dataKey 指向选项数组，则注入 rule.options
    // form-create 读取的是 rule.options，不是 rule.props.options
    if ((newRule.type === 'select' || newRule.type === 'radio') && isDataKey(newRule['dataKey'] as string)) {
      const resolvedOptions = resolveRuleDataKey(newRule['dataKey'] as string, dataSet)
      if (Array.isArray(resolvedOptions)) {
        newRule.options = resolvedOptions as Rule[]
      }
    }
    
    // 🎯 处理 dataSource 绑定（r-table, r-tree 共用 —— 脚本写入 pageData 的值）
    if ((newRule.type === 'r-table' || newRule.type === 'r-tree') && newRule['dataSource']) {
      const dataSource = pageData[newRule['dataSource'] as string]
      if (dataSource !== undefined) {
        // 强制绑定为 dataSource（不再向后兼容 props.data）
        setRuleProp(newRule, 'dataSource', dataSource)
      }
    }

    // 🎯 将 dataKey 透传到 props — r-table/r-form/r-detail/r-tree 自行 consume(PAGE_DATASET) 解析
    // el-table 保持旧的外部注入模式（原生组件无法使用 useSparkComponent）
    if (newRule['dataKey'] && isSelfResolvingType(newRule.type as string, registry)) {
      setRuleProp(newRule, 'dataKey', newRule['dataKey'] as string)
    }

    // 🎯 处理 r-tree 的 currentKey 绑定（用于 current-key 高亮）
    if (newRule.type === 'r-tree' && newRule['currentKey']) {
      const keys = (newRule['currentKey'] as string).split('.')
      const value = getNestedValue<string | number>(pageData, keys)
      if (value !== undefined) {
        setRuleProp(newRule, 'current-key', value)
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
        setRuleProp(newRule, 'dataSource', binding.source)
        setRuleProp(newRule, 'dataView', binding.source)
        // Element Plus el-table 需要 data 属性（响应式数组）
        setRuleProp(newRule, 'data', binding.source.rows)
      }
      // 如果有 dataSet，注入同步事件；传入 bindingId 用于 originatorId 回路防护
      if (dataSet) {
        injectTableEvents(newRule, dataSet, options.bindingId)
      }
    }
    
    // 🎯 处理普通元素的 dataKey 绑定（文本内容绑定或表单值绑定）
    // 排除已有专门处理逻辑的容器组件，以及 select/radio（其 dataKey 已由上方 options 注入块处理）
    if (newRule['dataKey'] && !isDataKeyHandledType(newRule.type as string, registry)
        && newRule.type !== 'select' && newRule.type !== 'radio') {
      const rawKey = newRule['dataKey'] as string
      let resolved: unknown

      if (isDataKey(rawKey)) {
        // DataSet 路径（@ 格式）：走 DataSet 解析，非法格式时打 warn
        resolved = resolveRuleDataKey(rawKey, dataSet)
        // 注入 DataView（若 dataKey 指向 DataSet）
        attachDataViewIfDataKey(rawKey, dataSet, newRule)
      } else {
        // $data 路径（dot 格式，如 currentUser.label）：从 pageData 中按路径取值
        const keys = rawKey.split('.')
        resolved = getNestedValue(pageData, keys)
      }

      // 如果有值，根据元素类型决定绑定方式
      if (resolved !== undefined && resolved !== null) {
        // 表单元素（持有 modelValue 的组件）：绑定到 props.modelValue
        // 注意：el-radio-group / el-checkbox-group / el-select 等如果绑定到 children 会破坏子节点结构
        const isFormElement =
          typeof newRule.type === 'string' && (
            newRule.type === 'el-input' ||
            newRule.type === 'el-textarea' ||
            newRule.type === 'el-input-number' ||
            newRule.type === 'el-select' ||
            newRule.type === 'el-radio-group' ||
            newRule.type === 'el-checkbox-group' ||
            newRule.type === 'el-switch' ||
            newRule.type === 'el-slider' ||
            newRule.type === 'el-rate' ||
            newRule.type === 'el-date-picker' ||
            newRule.type === 'el-time-picker' ||
            newRule.type === 'el-color-picker'
          )
        if (isFormElement) {
          setRuleProp(newRule, 'modelValue', resolved)
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
          dataSet,
          ...(registry !== undefined ? { registry } : {})
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
 * 事件携带 originatorId，下游 useRuleBinding 仅跳过同一 bindingId 的回写，
 * 其他同级 binding 实例仍正常进行 DataSet→UI 同步。
 *
 * DataSet → UI 方向由 useRuleBinding 经 bus 单独负责。
 */
function injectTableEvents(
  rule: Rule,
  dataSet: IDataSet,
  bindingId?: string
): void {
  const rawKey = rule['dataKey'] as string | undefined
  if (!rawKey) return

  const dk = parseDataKey(rawKey)
  if (!dk) return

  const { tableName, viewId } = dk
  rule.name ??= `table_${tableName}_${viewId}`
  rule.on ??= {}

  // 提前查找并缓存 view，避免两个事件处理器各自重复调用 getTable + getOrCreateView
  const table = dataSet.getTable(tableName)
  if (!table) return
  const view = table.getOrCreateView(viewId)

  // 注入 currentChange 事件（单选行变化）
  const originalCurrentChange = rule.on['currentChange']
  rule.on['currentChange'] = (currentRow: IDataRow | null, oldRow: IDataRow | null) => {
    pageLogger.debug(`[TableEvent] currentChange`, { tableName, viewId })

    if (typeof originalCurrentChange === 'function') {
      (originalCurrentChange as (current: unknown, old: unknown) => void)(currentRow, oldRow)
    }

    if (currentRow === null) {
      view.setCurrentRow(null, bindingId)
      return
    }

    // form-create 会污染原始对象（添加 $f/api/rule 属性），原始数据保存在 row.args[0]
    let cleanRow: IDataRow | null = null
    if ('args' in currentRow && Array.isArray((currentRow as { args: unknown }).args)) {
      const maybeRow = (currentRow as { args: unknown[] }).args[0]
      if (maybeRow && typeof maybeRow === 'object') cleanRow = maybeRow as IDataRow
    }
    if (!cleanRow) {
      const pk = view.getPrimaryKeyValue(currentRow)
      if (pk !== undefined) cleanRow = view.rows.find(r => view.getPrimaryKeyValue(r) === pk) ?? null
    }
    if (cleanRow) view.setCurrentRow(cleanRow, bindingId)
  }

  // 注入 selectionChange 事件（多选变化）
  const originalSelectionChange = rule.on['selectionChange']
  rule.on['selectionChange'] = (selection: IDataRow[]) => {
    pageLogger.debug(`[TableEvent] selectionChange`, { tableName, viewId, count: selection.length })

    if (typeof originalSelectionChange === 'function') {
      (originalSelectionChange as (selection: unknown) => void)(selection)
    }

    const valid = Array.isArray(selection) ? selection : []
    view.setSelectedRows(valid, bindingId)
  }
}
