/**
 * Domain Registry — 域注册 + 会话工厂
 *
 * 各域通过 registerDomain() 注册自身的 stills 和 session state。
 * createSession() 自动为每个已注册域创建 state。
 */

import type { StillsCatalog } from '../catalog/stills-catalog-types'
import componentCatalogJson from '../catalog/component-catalog.json'
import type { ComponentCatalog } from '../catalog/types'
import { projectStillsCatalog } from '../catalog/catalog-projections'
import type { IStillSession, DomainProvider } from './types'
import { registerAll } from './dispatcher'

// ═══════════════════════════════════════════════════════════
// Domain Registry
// ═══════════════════════════════════════════════════════════

const _domains = new Map<string, DomainProvider>()

/**
 * 注册一个域。
 *
 * 域注册是双写操作：
 * 1. 写入 domain 注册表，供 createSession() 创建 state；
 * 2. 将域内 stills 注册到 dispatcher 的 action registry。
 */
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

// ═══════════════════════════════════════════════════════════
// Session Factory
// ═══════════════════════════════════════════════════════════

export interface CreateSessionOptions {
  catalog?: StillsCatalog
}

const DEFAULT_SESSION_CATALOG = projectStillsCatalog(componentCatalogJson as ComponentCatalog)

function createBaseSession(options?: CreateSessionOptions): IStillSession {
  return {
    patchLog: [],
    domains: {},
    catalog: options?.catalog ?? DEFAULT_SESSION_CATALOG,
  }
}

/** 创建会话：初始化框架字段 + 每个已注册域的 state */
export function createSession(options?: CreateSessionOptions): IStillSession {
  const session = createBaseSession(options)

  for (const [name, domain] of _domains) {
    session.domains[name] = domain.createState()
  }

  return session
}
