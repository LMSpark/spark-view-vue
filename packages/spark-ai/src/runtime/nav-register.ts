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

export interface NavRegister {
  registerPageNavigation(pageId: string, options?: NavRegistrationOptions): Promise<NavRegistrationResult>
}

export function createNavRegister(options: {
  getNavApiUrl: () => string
  getHeaders?: () => Record<string, string>
}): NavRegister {
  const http = createRequest({ timeout: 15_000 })
  if (options.getHeaders) {
    const getHeaders = options.getHeaders
    http.interceptors.request.use({
      onRequest: (config) => {
        config.headers = { ...config.headers, ...getHeaders() }
        return config
      },
    })
  }

  async function registerPageNavigation(
    pageId: string,
    navOptions?: NavRegistrationOptions,
  ): Promise<NavRegistrationResult> {
    const title = navOptions?.title ?? formatTitle(pageId)
    const description = navOptions?.prompt
      ? navOptions.prompt.slice(0, 60)
      : undefined

    const node: NavNode = {
      id: pageId,
      nodeKind: 'page',
      title,
      icon: navOptions?.icon ?? 'Document',
      path: `/${pageId}`,
      ...(description !== undefined && { description }),
    }

    try {
      await http.post(`${options.getNavApiUrl()}/nodes`, {
        node,
        parentId: navOptions?.parentId ?? null,
      })
      return { success: true, alreadyExists: false }
    } catch (err: unknown) {
      if (isDuplicateNodeError(err)) {
        return { success: true, alreadyExists: true }
      }
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, alreadyExists: false, error: message }
    }
  }

  return { registerPageNavigation }
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
