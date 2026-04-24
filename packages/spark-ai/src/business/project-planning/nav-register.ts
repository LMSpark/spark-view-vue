/**
 * 导航自动注册 — AI 生成页面后自动注册到导航树
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

export interface NavRegistrationOptions {
  title?: string
  icon?: string
  parentId?: string
  prompt?: string
}

export interface NavRegistrationResult {
  success: boolean
  alreadyExists: boolean
  error?: string
}

function isDuplicateNodeError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false

  const response = (err as Record<string, unknown>)['response']
  if (typeof response === 'object' && response !== null) {
    const errorMsg = (response as Record<string, unknown>)['error']
    if (typeof errorMsg === 'string' && errorMsg.includes('已存在')) return true
  }

  if (err instanceof Error && err.message.includes('已存在')) return true

  return false
}

function formatTitle(pageId: string): string {
  return pageId
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}