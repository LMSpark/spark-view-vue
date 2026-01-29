import { getLogger } from './logger.js'

let config: Record<string, any> = {}
const watchers = new Map<string, Set<(v: any) => void>>()

export function setConfig(newConfig: Record<string, any>) { config = { ...config, ...newConfig }; getLogger().info('Config set', newConfig); Object.entries(newConfig).forEach(([k, v]) => { watchers.get(k)?.forEach(cb => cb(v)) }) }
export function getConfig<T = any>(key: string, defaultValue?: T): T
export function getConfig<T = any>(): Record<string, any>
export function getConfig<T = any>(key?: string, defaultValue?: T): any {
  if (!key) return config as Record<string, any>
  return (config[key] ?? defaultValue) as T
}

export function clearConfig() { config = {}; getLogger().info('Config cleared'); watchers.clear() }

export class ConfigManager {
  private static instance: ConfigManager | null = null
  static getInstance(): ConfigManager { if (!this.instance) this.instance = new ConfigManager(); return this.instance }
  get<T = any>(key: string, defaultValue?: T): T | undefined { return getConfig<T>(key, defaultValue) }
  set<T = any>(key: string, value: T): void { const old = config[key]; config[key] = value; getLogger().info(`Config updated: ${key}`); if (old !== value) { watchers.get(key)?.forEach(cb => cb(value)) } }
  delete(key: string): void { const had = config[key] !== undefined; delete config[key]; if (had) { watchers.get(key)?.forEach(cb => cb(undefined)) } }
  watch(key: string, cb: (value: any) => void): () => void { if (!watchers.has(key)) watchers.set(key, new Set()); watchers.get(key)!.add(cb); return () => { watchers.get(key)!.delete(cb) } }
  setMultiple(obj: Record<string, any>): void { setConfig(obj) }
  getAll(): Record<string, any> { return { ...config } }
  reset(): void { clearConfig() }
}
