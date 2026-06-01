import type { PageDesignEditHost } from '../../contract/edit-host.contract'

export type PageDesignServiceContext = {
  requestId: string
  pageId: string
}

export type PageDesignServiceOptions = {
  getEditHost: (context: PageDesignServiceContext) => PageDesignEditHost
}

export type PageDesignServiceResult<TResult> =
  | { ok: true; data: TResult; summary: string }
  | { ok: false; code: string; msg: string; fix: string }

export type PageDesignTextFileKey = 'script' | 'style'

export type PageDesignServiceActionBinding<TTarget> = {
  serviceLabel: string
  run: (target: TTarget, args: unknown) => unknown
  mutates: boolean
  fixHint?: string
}

export function pageDesignServiceFailure(
  code: string,
  msg: string,
  fix: string,
): PageDesignServiceResult<never> {
  return { ok: false, code, msg, fix }
}
