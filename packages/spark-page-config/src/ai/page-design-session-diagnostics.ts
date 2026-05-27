/**
 * PageDesign AI session diagnostics.
 *
 * 该模块只处理 pageDesign 通用结构证据：rule.json 中出现了哪些目录组件、
 * 当前 AI 会话是否显式查询过这些组件的 payload guide。具体业务页面是否合格
 * 由对应 smoke/test 自己判断，不放入 page-config 底层。
 */

import type { AiAgentSessionRecord } from '@spark-view/spark-ai/agent'
import { isRecord } from '@spark-view/spark-utils'
import { hasPageDesignComponentPayloadKey } from './payload-catalog-tool-catalog'

// ── 公共 DTO ────────────────────────────────────────────────

export type PageDesignFileSnapshot = Readonly<Record<string, string | undefined>>

export type PageDesignPayloadGuideValidation = Readonly<{
  ok: boolean
  componentTypes: readonly string[]
  guidedPayloadKeys: readonly string[]
  missingGuides: readonly string[]
}>

type PageDesignJsonParseResult = Readonly<
  | { ok: true; data: unknown }
  | { ok: false; error: string }
>

// ── 公共诊断入口 ────────────────────────────────────────────

// PAGE_DESIGN_REFACTOR_SOURCE[payload-guide-session-diagnostics]: pageDesign 会话中显式 guidePayload 证据的解析来源；具体业务页面验收不要放到这里。
/**
 * 校验 rule.json 中的目录组件是否都能在会话历史里找到显式 `guidePayload`。
 *
 * 该检查只证明“组件参数指南已喂给 LLM”，不判断页面业务目标是否完成。
 */
export function validatePageDesignPayloadGuidesFromSession(
  files: PageDesignFileSnapshot,
  sessionRecord: AiAgentSessionRecord | null | undefined,
): PageDesignPayloadGuideValidation {
  const componentTypes = componentTypesFromPageDesignRule(files)
  const guidedPayloadKeys = guidedPageDesignPayloadKeysFromSession(sessionRecord)
  const guidedSet = new Set(guidedPayloadKeys)
  const missingGuides = componentTypes.filter((type) => !guidedSet.has(type))
  return {
    ok: missingGuides.length === 0,
    componentTypes,
    guidedPayloadKeys,
    missingGuides,
  }
}

// ── 结构事实提取 ────────────────────────────────────────────

/**
 * 从 rule.json 收集 payload-catalog 内存在的组件 type。
 *
 * 标准 HTML 或未知业务 type 不在此集合内；未知 type 的拦截由 node-tree 写入边界负责。
 */
export function componentTypesFromPageDesignRule(files: PageDesignFileSnapshot): readonly string[] {
  const rule = parsePageDesignJsonFile(files, 'rule.json')
  if (!rule.ok) return []
  return [...new Set(flattenPageDesignSparkNodes(rule.data)
    .map((node) => typeof node['type'] === 'string' ? node['type'].trim() : '')
    .filter((type) => type.length > 0 && hasPageDesignComponentPayloadKey(type)))]
    .sort()
}

/**
 * 从 Host 会话历史中提取成功发起过的 `payload-catalog.guidePayload` key。
 *
 * 这里只读取 functionCall 参数，不依赖工具结果内容，方便保留失败重试前后的完整诊断。
 */
export function guidedPageDesignPayloadKeysFromSession(
  sessionRecord: AiAgentSessionRecord | null | undefined,
): readonly string[] {
  return [...new Set((sessionRecord?.history ?? []).flatMap((entry) => {
    if (entry.kind !== 'functionCall') return []
    if (entry.toolName !== 'module_call') return []
    if (!isRecord(entry.args)) return []
    if (entry.args['functionName'] !== 'guidePayload') return []
    const callArgs = entry.args['args']
    if (!isRecord(callArgs)) return []
    const key = typeof callArgs['key'] === 'string' ? callArgs['key'].trim() : ''
    return key.length > 0 ? [key] : []
  }))].sort()
}

// ── JSON 与节点树工具 ───────────────────────────────────────

/**
 * 解析页面四文件快照中的 JSON 文件，失败时返回结构化错误而非抛出。
 */
export function parsePageDesignJsonFile(
  files: PageDesignFileSnapshot,
  name: string,
): PageDesignJsonParseResult {
  try {
    return { ok: true, data: JSON.parse(files[name] ?? '') }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * 递归展平 SparkNode-like 对象，供 smoke/诊断读取 rule.json 结构事实。
 *
 * 该函数只做宽松识别，不归一化、不校验、不修改节点；严格写入校验仍在 node-tree。
 */
export function flattenPageDesignSparkNodes(value: unknown): ReadonlyArray<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(flattenPageDesignSparkNodes)
  if (!isRecord(value)) return []
  const current = isSparkNodeLike(value) ? [value] : []
  const nested = Object.values(value).flatMap(flattenPageDesignSparkNodes)
  return [...current, ...nested]
}

// ── 私有类型守卫 ────────────────────────────────────────────

function isSparkNodeLike(value: Record<string, unknown>): boolean {
  return typeof value['type'] === 'string'
    && (
      typeof value['id'] === 'string'
      || isRecord(value['props'])
      || Array.isArray(value['children'])
    )
}
