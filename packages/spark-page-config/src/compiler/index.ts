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
  PageScriptConfig,
  PageCssConfig
} from '../types'
import { DataSet, SparkData } from '@spark-view/spark-data'

type ObjectFactory = (input: Record<string, unknown>) => PageDataConfig

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function resolveCanonicalFactory(): ObjectFactory {
  const sparkDataObj = SparkData as unknown as Record<string, unknown>
  const dataSetCtor = DataSet as unknown as Record<string, unknown>

  const fromJSON =
    (typeof sparkDataObj['fromJSON'] === 'function' ? sparkDataObj['fromJSON'] : undefined)
    ?? (typeof dataSetCtor['fromJSON'] === 'function' ? dataSetCtor['fromJSON'] : undefined)
  if (fromJSON) {
    return (input) => (fromJSON as (raw: string) => PageDataConfig)(JSON.stringify(input))
  }

  const fromJson =
    (typeof sparkDataObj['fromJson'] === 'function' ? sparkDataObj['fromJson'] : undefined)
    ?? (typeof dataSetCtor['fromJson'] === 'function' ? dataSetCtor['fromJson'] : undefined)
  if (fromJson) {
    return (input) => (fromJson as (raw: Record<string, unknown>) => PageDataConfig)(input)
  }

  {
    throw new Error('spark-data 未导出可用的 canonical 数据集工厂（fromJSON/fromJson）')
  }
}

function resolvePageDataFactory(): ObjectFactory {
  const sparkDataObj = SparkData as unknown as Record<string, unknown>
  if (typeof sparkDataObj['fromPageData'] === 'function') {
    return (input) => (sparkDataObj['fromPageData'] as (raw: Record<string, unknown>) => PageDataConfig)(input)
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

  const tableMap = rawTables as Record<string, unknown>
  const normalizedTables: Record<string, unknown> = {}
  for (const [tableName, tableMeta] of Object.entries(tableMap)) {
    if (tableMeta === null || tableMeta === undefined || typeof tableMeta !== 'object' || Array.isArray(tableMeta)) {
      normalizedTables[tableName] = {
        tableName,
        columns: [],
        rows: [],
        views: { default: {} },
      }
      continue
    }

    const table = { ...(tableMeta as Record<string, unknown>) }
    table['tableName'] = typeof table['tableName'] === 'string' && table['tableName'].trim() !== ''
      ? table['tableName']
      : tableName
    const rawViews = table['views']
    if (rawViews === undefined || rawViews === null || typeof rawViews !== 'object' || Array.isArray(rawViews)) {
      table['views'] = { default: {} }
    } else {
      const views = { ...(rawViews as Record<string, unknown>) }
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
 * rule.json 原始字符串 → 规范化 RuleConfig[]
 *
 * 规范化内容：
 * - 顶层确保是 Array（单对象自动包装）
 * - 每条规则：type 强制 string；props 缺省 {}；children null→undefined，递归规范化
 * - 后续可在此加：类型别名展开、dataKey 格式校验、props 默认值注入
 */
export function compileRule(raw: string): RuleConfig[] {
  const parsed: unknown = JSON.parse(raw)
  const arr = Array.isArray(parsed) ? parsed : [parsed]
  return arr.map(normalizeRuleNode)
}

/**
 * 需要从节点顶层自动提升到 props 的字段集合。
 *
 * SparkComponentRenderer 只透传 node.props，顶层额外字段会被 normalizeSparkNode 丢弃。
 * 在编译阶段将这些字段提升到 props，兼容历史 rule.json 中未规范写入 props 的配置。
 * 提升规则：props 内已有同名字段时保留 props 内的值（不覆盖）。
 */
const HOIST_TO_PROPS_KEYS: ReadonlySet<string> = new Set(['dataKey', 'field'])

function normalizeRuleValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeRuleValue)
  if (value === null || typeof value !== 'object') return value

  const candidate = value as Record<string, unknown>
  if (typeof candidate['type'] === 'string') return normalizeRuleNode(candidate)

  const normalized: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(candidate)) {
    normalized[key] = normalizeRuleValue(nestedValue)
  }
  return normalized
}

export function normalizeRuleNode(node: unknown): RuleConfig {
  if (typeof node === 'string') return { type: node }
  if (node === null || node === undefined || typeof node !== 'object') return { type: String(node) }
  // 先把 children 从展开中排除，避免 null 被带入结果
  const { children: rawChildren, ...rest } = node as Record<string, unknown>
  const nextRest = { ...rest }

  const children =
    rawChildren === null || rawChildren === undefined
      ? undefined
      : (Array.isArray(rawChildren) ? rawChildren : [rawChildren]).map((c: unknown) =>
          typeof c === 'string' ? c : normalizeRuleNode(c)
        )
  // 从顶层提升到 props（props 已有值时不覆盖）
  const rawPropsSource = nextRest['props'] !== null && typeof nextRest['props'] === 'object' && !Array.isArray(nextRest['props'])
    ? nextRest['props'] as Record<string, unknown>
    : {}
  const rawProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rawPropsSource)) {
    if (key === 'id') continue
    rawProps[key] = normalizeRuleValue(value)
  }
  const legacyPropsId = rawPropsSource['id']
  if (
    !hasOwn(nextRest, 'id')
    && typeof legacyPropsId === 'string'
    && legacyPropsId.trim() !== ''
  ) {
    nextRest['id'] = legacyPropsId
  }
  const hoistedProps: Record<string, unknown> = {}
  for (const key of HOIST_TO_PROPS_KEYS) {
    if (key in nextRest && !(key in rawProps)) {
      hoistedProps[key] = nextRest[key]
    }
  }
  const type = String(nextRest['type'] ?? 'div')
  const props = Object.keys(hoistedProps).length > 0 ? { ...hoistedProps, ...rawProps } : rawProps
  return {
    ...nextRest,
    type,
    props,
    ...(children !== undefined && { children })
  } as RuleConfig
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
  const parsed: unknown = JSON.parse(raw)
  if (parsed === null || parsed === undefined) {
    return createDefaultDataSet()
  }
  if (typeof parsed !== 'object') {
    return createDataSetFromInput({ value: parsed })
  }
  const obj = parsed as Record<string, unknown>
  return createDataSetFromInput(obj)
}

// ── Script / CSS 编译 ────────────────────────────────────────────────

/**
 * script.js 原始字符串 → PageScriptConfig（脚本文本）
 *
 * 当前：透传（占位）。
 * 后续可加：语法检查、沙箱包装、依赖提取、压缩。
 */
export function parseScript(raw: string): PageScriptConfig {
  return raw
}

/**
 * style.css 原始字符串 → PageCssConfig（样式文本）
 *
 * 当前：透传（占位）。
 * 后续可加：CSS 变量提取、作用域前缀注入、压缩。
 */
export function parseCss(raw: string): PageCssConfig {
  return raw
}
