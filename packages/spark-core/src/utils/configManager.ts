import { Logger } from './logger.js'

let config: Record<string, unknown> = {}
const watchers = new Map<string, Set<(v: unknown) => void>>()

export function setConfig(newConfig: Record<string, unknown>) { config = { ...config, ...newConfig }; Logger().info('Config set', newConfig); Object.entries(newConfig).forEach(([k, v]) => { watchers.get(k)?.forEach(cb => cb(v)) }) }
export function getConfig<T = unknown>(key: string, defaultValue?: T): T
export function getConfig<T = unknown>(key?: string, defaultValue?: T): unknown {
  if (!key) return config as Record<string, unknown>
  return (config[key] ?? defaultValue) as unknown
}

export function clearConfig() { config = {}; Logger().info('Config cleared'); watchers.clear() }

export class ConfigManager {
  get<T = unknown>(key: string, defaultValue?: T): T | undefined { return getConfig<T>(key, defaultValue) }
  set<T = unknown>(key: string, value: T): void { const old = config[key]; config[key] = value; Logger().info(`Config updated: ${key}`); if (old !== value) { watchers.get(key)?.forEach(cb => cb(value)) } }
  delete(key: string): void { const had = config[key] !== undefined; delete config[key]; if (had) { watchers.get(key)?.forEach(cb => cb(undefined)) } }
  watch(key: string, cb: (value: unknown) => void): () => void { if (!watchers.has(key)) watchers.set(key, new Set()); watchers.get(key)!.add(cb); return () => { watchers.get(key)!.delete(cb) } }
  setMultiple(obj: Record<string, unknown>): void { setConfig(obj) }
  getAll(): Record<string, unknown> { return { ...config } }
  reset(): void { clearConfig() }
}
