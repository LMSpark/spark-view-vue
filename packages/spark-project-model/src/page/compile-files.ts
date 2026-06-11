/**
 * @module @spark-appworks/spark-project-model:page/compile-files
 * 职责：提供项目模型和页面配置域中的 compile files 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */

import { DataSet, SparkData } from '@spark-appworks/spark-data'
import { getSparkNodeChildren, isSparkNode, normalizeSparkNode, SparkNodeTree, type SparkNode } from '@spark-appworks/spark-data'

// ═══ DataSet 创建入口解析：模块加载时一次性探测 spark-data 暴露的构建入口 ═══

/** DataSet 创建函数签名：接收已解析的 JSON 对象，返回 DataSet。 */
type DataSetCreator = (input: Record<string, unknown>) => DataSet

/** 安全探测对象是否有指定自有属性。 */
function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

/** 判断目标是否为接收字符串的 DataSet 创建函数。 */
function isStringDataSetCreator(
  fn: unknown,
): fn is (raw: string) => DataSet {
  return typeof fn === 'function'
}

/** 判断目标是否为接收对象的 DataSet 创建函数。 */
function isObjectDataSetCreator(
  fn: unknown,
): fn is (raw: Record<string, unknown>) => DataSet {
  return typeof fn === 'function'
}

/** 判断目标是否为非空对象。 */
function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 将命名空间对象浅拷贝为可安全读取的 Record。 */
function getNamespaceRecord(target: unknown): Record<string, unknown> {
  if (!isNonEmptyObject(target)) return {}
  const record: Record<string, unknown> = {}
  for (const key of Object.getOwnPropertyNames(target)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key)
    if (descriptor !== undefined && typeof descriptor.get === 'function') continue
    record[key] = target[key]
  }
  return record
}

/**
 * 解析 canonical DataSet 创建函数：优先查找 SparkData.fromJSON / DataSet.fromJSON，
 * 其次查找 fromJson（小写）。两种签名分别接收 JSON 字符串和已解析对象。
 */
function resolveCanonicalDataSetCreator(): DataSetCreator {
  const sparkDataObj = getNamespaceRecord(SparkData)
  const dataSetCtor = getNamespaceRecord(DataSet)

  // 尝试 fromJSON（接收 JSON 字符串）
  const fromJSON = sparkDataObj['fromJSON'] ?? dataSetCtor['fromJSON']
  if (isStringDataSetCreator(fromJSON)) {
    return (input) => fromJSON(JSON.stringify(input))
  }

  // 尝试 fromJson（接收已解析对象）
  const fromJson = sparkDataObj['fromJson'] ?? dataSetCtor['fromJson']
  if (isObjectDataSetCreator(fromJson)) {
    return (input) => fromJson(input)
  }

  throw new Error('spark-data 未导出可用的 canonical 数据集创建函数（fromJSON/fromJson）')
}

/**
 * 解析 pageData 专用 DataSet 创建函数：优先使用 SparkData.fromPageData，
 * 不存在时回退到 canonical 创建函数。
 */
function resolvePageDataSetCreator(): DataSetCreator {
  const sparkDataObj = getNamespaceRecord(SparkData)
  const fromPageData = sparkDataObj['fromPageData']
  if (isObjectDataSetCreator(fromPageData)) {
    return (input) => fromPageData(input)
  }
  // 未提供专用 pagedata 创建函数时，退回 canonical 创建函数
  return resolveCanonicalDataSetCreator()
}

// ═══ DataSet 输入归一化：处理不规范输入，确保创建函数收到合法结构 ═══

/** 判断输入是否为 canonical DataSet 形态（包含 tables / dataSetName 等关键字段）。 */
function isCanonicalDataSetShape(obj: Record<string, unknown>): boolean {
  return hasOwn(obj, 'tables') || hasOwn(obj, 'dataSetName') || hasOwn(obj, 'version') || hasOwn(obj, 'pageId')
}

/**
 * 归一化 canonical DataSet 输入：
 * 1. 确保 tables 存在且为对象
 * 2. 为每张表补齐 tableName（缺失时以键名补入）
 * 3. 确保 views.default 存在
 */
function normalizeCanonicalDataSetInput(input: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...input }
  const rawTables = normalized['tables']
  if (rawTables === undefined || rawTables === null || typeof rawTables !== 'object' || Array.isArray(rawTables)) {
    normalized['tables'] = {}
    return normalized
  }

  const normalizedTables: Record<string, unknown> = {}
  for (const [tableName, tableMeta] of Object.entries(rawTables)) {
    if (!isNonEmptyObject(tableMeta)) {
      normalizedTables[tableName] = {
        tableName,
        columns: [],
        rows: [],
        views: { default: {} },
      }
      continue
    }

    const table: Record<string, unknown> = { ...tableMeta }
    table['tableName'] = typeof table['tableName'] === 'string' && table['tableName'].trim() !== ''
      ? table['tableName']
      : tableName
    const rawViews = table['views']
    if (!isNonEmptyObject(rawViews)) {
      table['views'] = { default: {} }
    } else {
      const views: Record<string, unknown> = { ...rawViews }
      if (!hasOwn(views, 'default') || views['default'] === null || views['default'] === undefined || typeof views['default'] !== 'object') {
        views['default'] = {}
      }
      table['views'] = views
    }

    normalizedTables[tableName] = table
  }

  normalized['tables'] = normalizedTables
  return normalized
}

/** 创建空 DataSet 作为解析失败时的默认值。 */
function createDefaultDataSet(): DataSet {
  return canonicalDataSetCreator({ dataSetName: 'PageDataSet', tables: {} })
}

// 模块加载时一次性解析创建函数，后续编译调用直接使用
const canonicalDataSetCreator = resolveCanonicalDataSetCreator()
const pageDataSetCreator = resolvePageDataSetCreator()

/** 根据输入形态选择合适的创建函数创建 DataSet 实例。 */
function createDataSetFromInput(input: Record<string, unknown>): DataSet {
  if (isCanonicalDataSetShape(input)) {
    return canonicalDataSetCreator(normalizeCanonicalDataSetInput(input))
  }
  return pageDataSetCreator(input)
}

// ═══ 公开编译入口：纯函数，字符串 → 类型化数据 ═══

/**
 * rule.json 原始字符串 → 规范化 SparkNode[]（页面顶层组件数组）。
 *
 * 规范化内容：
 * - 顶层可以是单个 SparkNode，也可以是 SparkNode[]
 * - 每条规则必须是合法 SparkNode
 * - 节点定位只接受顶层 `id`
 * - 不自动补齐缺失组件 id（fillMissingComponentId: false）
 */
export function compileRule(raw: string): SparkNode[] {
  if (raw.trim() === '') return []
  const tree = SparkNodeTree.fromRuleJson(raw, {
    fillMissingComponentId: false,
    historyLimit: 0,
  })
  return getSparkNodeChildren(tree.root.children)
}

/** 将未知值归一化为 SparkNode；类型不合法时 fail-fast。 */
export function normalizeRuleNode(node: unknown): SparkNode {
  if (!isSparkNode(node)) {
    throw new Error('rule.json 节点必须是 SparkNode：需要非空字符串 type')
  }
  return normalizeSparkNode(node)
}

/**
 * pagedata.json 原始字符串 → DataSet 实例。
 *
 * 流程：
 * 1. 空内容 → 返回默认空 DataSet
 * 2. 解析 JSON → 判断是否为 canonical 形态（tables / dataSetName 等）
 * 3. 选择 canonical 创建函数或 pageData 创建函数创建实例
 * 4. 归一化 tables 结构（补齐 tableName、确保 views.default 存在）
 */
export function parsePageData(raw: string): DataSet {
  if (raw.trim() === '') return createDefaultDataSet()
  const parsed: unknown = JSON.parse(raw)
  if (parsed === null || parsed === undefined) {
    return createDefaultDataSet()
  }
  if (!isNonEmptyObject(parsed)) {
    return createDataSetFromInput({ value: parsed })
  }
  return createDataSetFromInput(parsed)
}

/** script.js 原始字符串 → 脚本文本（当前透传；后续可加语法检查、沙箱包装）。 */
export function parseScript(raw: string): string {
  return raw
}

/** style.css 原始字符串 → 样式文本（当前透传；后续可加 CSS 变量提取、作用域前缀）。 */
export function parseCss(raw: string): string {
  return raw
}
