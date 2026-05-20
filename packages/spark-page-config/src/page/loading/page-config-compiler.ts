/**
 * 页面配置编译器 — 纯转换函数
 *
 * 职责：将原始字符串（JSON / JS / CSS）转换为类型化数据结构。
 * 所有函数均为无副作用的纯函数，不涉及网络请求、缓存或文件系统。
 *
 * 与 loader/ 分离的原因：
 * - loader 负责 **从哪里加载**（本地/远程/混合 + 缓存策略）
 * - compiler 负责 **如何解析**（字符串 → DataSet / RuleConfig / 脚本 / CSS）
 * - 两者可独立测试、独立演进
 */

import type {
  RuleConfig,
  PageDataConfig,
} from '../model/types'
import { DataSet, SparkData } from '@spark-view/spark-data'
import { isSparkNode, normalizeSparkNode, getSparkNodeChildren } from '../model/spark-node'
import { SparkNodeTree } from '../model/spark-node-tree'

interface ObjectFactory {
  (input: Record<string, unknown>): PageDataConfig
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function isStringFactory(
  fn: unknown,
): fn is (raw: string) => PageDataConfig {
  return typeof fn === 'function'
}

function isObjectFactory(
  fn: unknown,
): fn is (raw: Record<string, unknown>) => PageDataConfig {
  return typeof fn === 'function'
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getNamespaceRecord(target: unknown): Record<string, unknown> {
  if (!isNonEmptyObject(target)) return {}
  const record: Record<string, unknown> = {}
  for (const key of Object.getOwnPropertyNames(target)) {
    try {
      record[key] = target[key]
    } catch {
      // ignore inaccessible properties
    }
  }
  return record
}

function resolveCanonicalFactory(): ObjectFactory {
  const sparkDataObj = getNamespaceRecord(SparkData)
  const dataSetCtor = getNamespaceRecord(DataSet)

  const fromJSON = sparkDataObj['fromJSON'] ?? dataSetCtor['fromJSON']
  if (isStringFactory(fromJSON)) {
    return (input) => fromJSON(JSON.stringify(input))
  }

  const fromJson = sparkDataObj['fromJson'] ?? dataSetCtor['fromJson']
  if (isObjectFactory(fromJson)) {
    return (input) => fromJson(input)
  }

  {
    throw new Error('spark-data 未导出可用的 canonical 数据集工厂（fromJSON/fromJson）')
  }
}

function resolvePageDataFactory(): ObjectFactory {
  const sparkDataObj = getNamespaceRecord(SparkData)
  const fromPageData = sparkDataObj['fromPageData']
  if (isObjectFactory(fromPageData)) {
    return (input) => fromPageData(input)
  }

  // 未提供专用 pagedata 工厂时，退回 canonical 工厂
  return resolveCanonicalFactory()
}

function isCanonicalDataSetShape(obj: Record<string, unknown>): boolean {
  return hasOwn(obj, 'tables') || hasOwn(obj, 'dataSetName') || hasOwn(obj, 'version') || hasOwn(obj, 'pageId')
}

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

function createDefaultDataSet(): PageDataConfig {
  return canonicalFactory({ dataSetName: 'PageDataSet', tables: {} })
}

const canonicalFactory = resolveCanonicalFactory()
const pageDataFactory = resolvePageDataFactory()

function createDataSetFromInput(input: Record<string, unknown>): PageDataConfig {
  if (isCanonicalDataSetShape(input)) {
    return canonicalFactory(normalizeCanonicalDataSetInput(input))
  }
  return pageDataFactory(input)
}

// ── Rule 编译 ────────────────────────────────────────────────────────

/**
 * rule.json 原始字符串 → 规范化 SparkNode[]
 *
 * 规范化内容：
 * - 顶层可以是单个 SparkNode，也可以是 SparkNode[]
 * - 每条规则必须是合法 SparkNode
 * - 节点定位只接受顶层 `id`
 * - 根级业务字段提升等旧兼容逻辑已移除
 */
export function compileRule(raw: string): RuleConfig[] {
  if (raw.trim() === '') return []
  const tree = SparkNodeTree.fromRuleJson(raw, {
    fillMissingComponentId: false,
    historyLimit: 0,
  })
  return getSparkNodeChildren(tree.root.children)
}

export function normalizeRuleNode(node: unknown): RuleConfig {
  if (!isSparkNode(node)) {
    throw new Error('rule.json 节点必须是 SparkNode：需要非空字符串 type')
  }
  return normalizeSparkNode(node)
}

// ── PageData 编译 ────────────────────────────────────────────────────

/**
 * pagedata.json 原始字符串 → DataSet 实例
 *
 * 调用 SparkData/DataSet 暴露的标准工厂构建完整实例：分配对象、建各表的 DataTable/DataView，
 * 建立 DataSet → DataTable → DataView 引用链。
 * 统一以实体规范化逻辑为准，根级 `tables` 与 `dataset.tables` 都走同一条 canonical 化路径。
 * 实例缓存在内存派生缓存中，timestamp 不变时直接复用，
 * 同一页面多次访问跳过重建，冷启动仍需跑一次（但无网络请求）。
 */
export function parsePageData(raw: string): PageDataConfig {
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

// ── Script / CSS 编译 ────────────────────────────────────────────────

/**
 * script.js 原始字符串 → 原生 string（脚本文本）
 *
 * 当前：透传（占位）。
 * 后续可加：语法检查、沙箱包装、依赖提取、压缩。
 */
// 这里不再为 JS 基础类型保留导出别名，script/style 直接使用原生 string。
export function parseScript(raw: string): string {
  return raw
}

/**
 * style.css 原始字符串 → 原生 string（样式文本）
 *
 * 当前：透传（占位）。
 * 后续可加：CSS 变量提取、作用域前缀注入、压缩。
 */
export function parseCss(raw: string): string {
  return raw
}
