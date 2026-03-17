/**
 * 导航自动注册 — AI 生成页面后自动注册到导航树
 *
 * 验收标准（来自 AI_DRIVEN_FULL_LIFECYCLE_SOLUTION.md §6.3 Now）：
 *   - 页面生成后 3 秒内导航可见
 *   - 失败时有明确错误提示
 *
 * 设计要点：
 *   - 后端对节点 id 做唯一性校验（已存在 → 400 + "已存在"）
 *   - 注册失败不阻断页面生成流程（fire-and-forget with result）
 *   - 仅 generate 触发，iterate 不触发
 */

import { createRequest } from '@spark-view/spark-utils'
import type { NavNode } from '@spark-view/spark-utils'

// ─── 内部 HTTP 客户端（与 ai-loop 独立，避免循环依赖） ────────────────────

const http = createRequest({ timeout: 15_000 })

/** 动态导航 API 基础路径解析器（由应用层注入） */
let _getNavApiUrl: (() => string) | null = null

// ─── 配置 ────────────────────────────────────────────────────────────────────

/**
 * 配置导航注册模块的 HTTP 信息。
 * 通常在 `configureAILoopHttp` 中一并调用，无需应用层单独调用。
 */
export function configureNavRegister(options: {
  getNavApiUrl: () => string
  getHeaders?: () => Record<string, string>
}): void {
  _getNavApiUrl = options.getNavApiUrl
  if (options.getHeaders) {
    const getHeaders = options.getHeaders
    http.interceptors.request.use({
      onRequest: (config) => {
        config.headers = { ...config.headers, ...getHeaders() }
        return config
      },
    })
  }
}

function getNavApiUrl(): string {
  if (_getNavApiUrl) return _getNavApiUrl()
  return '/api/navigation'
}

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** 导航注册选项 */
export interface NavRegistrationOptions {
  /** 页面标题（导航树显示名称，默认 = pageId） */
  title?: string
  /** 图标名称（默认 'Document'） */
  icon?: string
  /** 父节点 ID（为空时追加到根级别第一个 sidebar 模块，或根） */
  parentId?: string
  /** 用户提示词（截取前 30 字符作为 description） */
  prompt?: string
}

/** 导航注册结果 */
export interface NavRegistrationResult {
  /** 操作是否成功（包括 alreadyExists 场景） */
  success: boolean
  /** 节点 ID 已存在于导航树（跳过注册，非错误） */
  alreadyExists: boolean
  /** 错误信息（仅 success=false 时有值） */
  error?: string
}

// ─── 核心函数 ────────────────────────────────────────────────────────────────

/**
 * 将 AI 生成的页面注册到导航树。
 *
 * - 构建 NavNode 兼容对象并 POST 到导航 API
 * - 后端检测到 id 重复时返回 400，此处视为 alreadyExists（非错误）
 * - 网络/服务器错误返回 success=false + error 信息
 */
export async function registerPageNavigation(
  pageId: string,
  options?: NavRegistrationOptions,
): Promise<NavRegistrationResult> {
  const title = options?.title ?? formatTitle(pageId)
  const description = options?.prompt
    ? options.prompt.slice(0, 60)
    : undefined

  const node: NavNode = {
    id: pageId,
    nodeKind: 'page',
    title,
    icon: options?.icon ?? 'Document',
    path: `/${pageId}`,
    ...(description !== undefined && { description }),
  }

  try {
    await http.post(`${getNavApiUrl()}/nodes`, {
      node,
      parentId: options?.parentId ?? null,
    })
    return { success: true, alreadyExists: false }
  } catch (err: unknown) {
    // 后端对重复 id 返回 400 + { error: "节点 id 已存在: xxx" }
    if (isDuplicateNodeError(err)) {
      return { success: true, alreadyExists: true }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, alreadyExists: false, error: message }
  }
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/**
 * 检测是否为"节点已存在"错误。
 * 后端返回 400 + `{ error: "节点 id 已存在: xxx" }`，
 * FetchClient 将 response body 存储在 `error.response`。
 */
function isDuplicateNodeError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false

  // RequestError.response 是后端 JSON body
  const response = (err as Record<string, unknown>)['response']
  if (typeof response === 'object' && response !== null) {
    const errorMsg = (response as Record<string, unknown>)['error']
    if (typeof errorMsg === 'string' && errorMsg.includes('已存在')) return true
  }

  // 兜底：检查 Error.message
  if (err instanceof Error && err.message.includes('已存在')) return true

  return false
}

/** 将 kebab-case pageId 格式化为人类可读标题 */
function formatTitle(pageId: string): string {
  return pageId
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}
