import type {
  PageDesignEditSession,
  PageDesignEditHost,
} from '../editing/page-design-edit-session'

export type PageDesignServiceContext = {
  requestId: string
  pageId: string
}

export type PageDesignServiceOptions = {
  getEditHost: (context: PageDesignServiceContext) => PageDesignEditHost
}

export type PageDesignServiceState = PageDesignEditSession
export type PageDesignServiceResult<TResult> =
  | { ok: true; data: TResult; summary: string }
  | { ok: false; code: string; msg: string; fix: string }

export type PageDesignTextFileKey = 'script' | 'style'

export type PageDesignServiceMethodBinding = {
  serviceLabel: string
  methodName: string
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
