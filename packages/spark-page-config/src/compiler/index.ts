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
import { DataSet } from '@spark-view/spark-data'

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

export function normalizeRuleNode(node: unknown): RuleConfig {
  if (typeof node === 'string') return { type: node }
  if (!node || typeof node !== 'object') return { type: String(node) }
  // 先把 children 从展开中排除，避免 null 被带入结果
  const { children: rawChildren, ...rest } = node as Record<string, unknown>
  const children =
    rawChildren === null || rawChildren === undefined
      ? undefined
      : (Array.isArray(rawChildren) ? rawChildren : [rawChildren]).map((c: unknown) =>
          typeof c === 'string' ? c : normalizeRuleNode(c)
        )
  return {
    ...rest,
    type: String(rest['type'] ?? 'div'),
    props: (rest['props'] as Record<string, unknown> | undefined) ?? {},
    ...(children !== undefined && { children })
  } as RuleConfig
}

// ── PageData 编译 ────────────────────────────────────────────────────

/**
 * pagedata.json 原始字符串 → DataSet 实例
 *
 * 调用 DataSet.fromJSON() 构建完整实例：分配对象、建各表的 DataTable/DataView，
 * 建立 DataSet → DataTable → DataView 引用链。
 * 实例缓存在内存派生缓存中，timestamp 不变时直接复用，
 * 同一页面多次访问跳过重建，冷启动仍需跑一次（但无网络请求）。
 */
export function parsePageData(raw: string): PageDataConfig {
  const parsed: unknown = JSON.parse(raw)
  if (parsed === null || parsed === undefined) {
    return DataSet.fromConfig({ dataSetName: 'PageDataSet', tables: {} })
  }
  if (typeof parsed !== 'object') {
    return DataSet.fromPageData({ value: parsed })
  }
  const obj = parsed as Record<string, unknown>
  if ('tables' in obj) {
    return DataSet.fromJSON(raw)
  }
  return DataSet.fromPageData(obj)
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
