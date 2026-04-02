/**
 * Domain Registry — 域注册 + 会话工厂
 *
 * 各域通过 registerDomain() 注册自身的 stills 和 session slot。
 * createSession() 自动为每个已注册域创建 slot。
 */

import type { IStillSession, DomainProvider } from './types'
import { registerAll } from './dispatcher'

// ─── Domain Registry ────────────────────────────────────────

const _domains = new Map<string, DomainProvider>()

/** 注册一个域：写入 domain 注册表 + 将域的 stills 注册到 action registry */
export function registerDomain(domain: DomainProvider): void {
  _domains.set(domain.name, domain)
  registerAll(domain.stills)
}

/** 获取已注册域 */
export function getDomain(name: string): DomainProvider | undefined {
  return _domains.get(name)
}

/** 清空域注册表（测试用） */
export function clearDomains(): void {
  _domains.clear()
}

// ─── Session Factory ────────────────────────────────────────

/** 创建会话：初始化框架字段 + 每个已注册域的 slot */
export function createSession(): IStillSession {
  const session: IStillSession = {
    blueprint: null,
    patchLog: [],
    domains: {},
  }
  for (const [name, domain] of _domains) {
    session.domains[name] = domain.createSlot()
  }
  return session
}
