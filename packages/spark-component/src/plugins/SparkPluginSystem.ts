import { Logger } from '@spark-view/spark-utils'
import type { Plugin, PluginHooks } from '../types/spark-component.js'

const logger = Logger('Spark:Plugin')

class SparkPluginManager {
  private plugins = new Map<string, Plugin>()
  private hooks: Partial<Record<keyof PluginHooks, Function>> = {}

  install(plugin: Plugin) {
    if (this.plugins.has(plugin.name)) this.uninstall(plugin.name)
    // Cast to ComponentManager for plugin authors; this manager is intentionally minimal in plugin context
    plugin.install?.(this as unknown as import('../types/spark-component.js').ComponentManager)
    this.plugins.set(plugin.name, plugin)
    logger.info(`✅ Installed SPARK plugin: ${plugin.name} (${plugin.version})`)
  }
  uninstall(name: string) {
    const p = this.plugins.get(name)
    if (!p) return false
    p.uninstall?.(this as unknown as import('../types/spark-component.js').ComponentManager)
    this.plugins.delete(name)
    logger.info(`🗑️ Uninstalled SPARK plugin: ${name}`)
    return true
  }
  get(name: string) { return this.plugins.get(name) }
  has(name: string) { return this.plugins.has(name) }
  getAll() { return Array.from(this.plugins.values()) }
  registerHook<K extends keyof PluginHooks>(hookName: K, hook: NonNullable<PluginHooks[K]>) {
    const prev = this.hooks[hookName]
    if (prev) {
      const prevFn = prev as (...args: unknown[]) => unknown
      const hookFn = hook as (...args: unknown[]) => unknown
      this.hooks[hookName] = (...args: unknown[]) => { prevFn(...args); hookFn(...args) }
    } else this.hooks[hookName] = hook as (...args: unknown[]) => unknown
  }
  async executeHook<K extends keyof PluginHooks>(hookName: K, ...args: Parameters<NonNullable<PluginHooks[K]>>) {
    const fn = this.hooks[hookName]
    if (!fn) return
    try { 
      await (fn as (...args: unknown[]) => Promise<unknown>)(...args) 
    } catch (e: unknown) { 
      logger.error(`Plugin hook '${String(hookName)}' execution failed:`, String(e)) 
    }
  }
  clear() { Array.from(this.plugins.keys()).forEach(k => this.uninstall(k)) }
}

const globalPluginManager = new SparkPluginManager()
export function installSparkPlugin(p: Plugin) { globalPluginManager.install(p) }
export function uninstallSparkPlugin(name: string) { return globalPluginManager.uninstall(name) }
export function getSparkPlugin(name: string) { return globalPluginManager.get(name) }

export type { Plugin, PluginHooks } from '../types/spark-component.js'
