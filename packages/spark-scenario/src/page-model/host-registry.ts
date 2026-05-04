import type { PageModelHost, PageModelHostKey } from './contracts'
import { serializePageModelHostKey } from './contracts'

export interface PageModelHostRegistry {
  register: (host: PageModelHost) => void
  unregister: (key: PageModelHostKey) => boolean
  get: (key: PageModelHostKey) => PageModelHost | undefined
  require: (key: PageModelHostKey) => PageModelHost
  clear: () => void
  list: () => readonly PageModelHost[]
}

export function createPageModelHostRegistry(initial: readonly PageModelHost[] = []): PageModelHostRegistry {
  const hosts = new Map<string, PageModelHost>()

  function register(host: PageModelHost): void {
    hosts.set(serializePageModelHostKey(host.key), host)
  }

  function unregister(key: PageModelHostKey): boolean {
    return hosts.delete(serializePageModelHostKey(key))
  }

  function get(key: PageModelHostKey): PageModelHost | undefined {
    return hosts.get(serializePageModelHostKey(key))
  }

  function requireHost(key: PageModelHostKey): PageModelHost {
    const host = get(key)
    if (host === undefined) {
      throw new Error(`PageModelHost not found: ${serializePageModelHostKey(key)}`)
    }
    return host
  }

  function clear(): void {
    hosts.clear()
  }

  function list(): readonly PageModelHost[] {
    return Array.from(hosts.values())
  }

  for (const host of initial) {
    register(host)
  }

  return {
    register,
    unregister,
    get,
    require: requireHost,
    clear,
    list,
  }
}
