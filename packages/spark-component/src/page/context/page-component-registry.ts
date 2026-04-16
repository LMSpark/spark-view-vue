import type {
  PageComponentApiEntry,
  PageComponentInstanceEntry,
  PageComponentRegistry,
} from '../../core/capability-keys.js'

export function createPageComponentRegistry(): PageComponentRegistry {
  const instanceMap = new Map<string, PageComponentInstanceEntry>()
  const instanceRefCount = new Map<string, number>()
  const apiMap = new Map<string, PageComponentApiEntry>()

  function listInstances(type?: string): PageComponentInstanceEntry[] {
    if (type === undefined || type.trim().length === 0) {
      return Array.from(instanceMap.values())
    }
    return Array.from(instanceMap.values()).filter(item => item.type === type)
  }

  function listApis(type?: string): PageComponentApiEntry[] {
    if (type === undefined || type.trim().length === 0) {
      return Array.from(apiMap.values())
    }
    return Array.from(apiMap.values()).filter(item => item.type === type)
  }

  return {
    registerInstance(entry) {
      const normalized = entry.props === undefined
        ? { id: entry.id, type: entry.type }
        : { id: entry.id, type: entry.type, props: entry.props }
      instanceMap.set(entry.id, normalized)
      const count = instanceRefCount.get(entry.id) ?? 0
      instanceRefCount.set(entry.id, count + 1)
    },
    unregisterInstance(id) {
      const count = instanceRefCount.get(id) ?? 0
      if (count <= 1) {
        instanceRefCount.delete(id)
        instanceMap.delete(id)
        apiMap.delete(id)
        return
      }
      instanceRefCount.set(id, count - 1)
    },
    listInstances,
    getInstance(id) {
      return instanceMap.get(id) ?? null
    },

    registerApi(entry) {
      apiMap.set(entry.id, {
        id: entry.id,
        type: entry.type,
        api: entry.api,
      })
    },
    unregisterApi(id) {
      apiMap.delete(id)
    },
    listApis,
    getApi<T = unknown>(id: string): T | null {
      const entry = apiMap.get(id)
      return entry ? (entry.api as T) : null
    },
    getApisByType<T = unknown>(type: string): T[] {
      return listApis(type).map(item => item.api as T)
    },
  }
}
