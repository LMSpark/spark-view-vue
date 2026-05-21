/**
 * PageDesign 服务契约。
 *
 * 定义 PageDesignService 的上下文、选项、结果类型和 action 绑定接口。
 * 所有通过该服务调用的业务动作都遵循统一的 success/failure 响应格式。
 */
import type {
  PageDesignEditHost,
} from '../editing/page-design-edit-session'

/** 服务调用上下文：标识哪个页面发起的请求。 */
export interface PageDesignServiceContext {
  requestId: string
  pageId: string
}

/** 服务构造选项：提供编辑宿主的解析函数。 */
export interface PageDesignServiceOptions {
  getEditHost: (context: PageDesignServiceContext) => PageDesignEditHost
}

/** 服务方法调用结果：成功时返回 data + 摘要，失败时返回错误码和修复建议。 */
export type PageDesignServiceResult<TResult> =
  | { ok: true; data: TResult; summary: string }
  | { ok: false; code: string; msg: string; fix: string }

export type PageDesignTextFileKey = 'script' | 'style'

export interface PageDesignServiceActionBinding<TTarget> {
  serviceLabel: string
  run: (target: TTarget, args: unknown) => unknown
  mutates: boolean
  fixHint?: string
}

export function pageDesignServiceSuccess<TResult>(
  data: TResult,
  summary: string,
): PageDesignServiceResult<TResult> {
  return { ok: true, data, summary }
}

export function pageDesignServiceFailure(
  code: string,
  msg: string,
  fix: string,
): PageDesignServiceResult<never> {
  return { ok: false, code, msg, fix }
}

function getProp(value: object, key: string): unknown {
  const desc = Object.getOwnPropertyDescriptor(value, key)
  return desc?.value
}

export function isPageDesignServiceResult(value: unknown): value is PageDesignServiceResult<unknown> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false
  const ok = getProp(value, 'ok')
  if (ok === true) {
    return 'data' in value && typeof getProp(value, 'summary') === 'string'
  }
  if (ok === false) {
    return typeof getProp(value, 'code') === 'string'
      && typeof getProp(value, 'msg') === 'string'
      && typeof getProp(value, 'fix') === 'string'
  }
  return false
}
