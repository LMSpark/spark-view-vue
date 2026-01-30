import type { Plugin, PluginHooks, ComponentContext } from '../types/spark-component.js'

class SparkPluginManager {
  private plugins = new Map<string, Plugin>()
  private hooks: Partial<Record<keyof PluginHooks, Function>> = {}

  install(plugin: Plugin) {
    if (this.plugins.has(plugin.name)) this.uninstall(plugin.name)
    // Cast to ComponentManager for plugin authors; this manager is intentionally minimal in plugin context
    plugin.install?.(this as unknown as import('../types/spark-component.js').ComponentManager)
    this.plugins.set(plugin.name, plugin)
    console.log(`✅ Installed SPARK plugin: ${plugin.name} (${plugin.version})`)
  }
  uninstall(name: string) {
    const p = this.plugins.get(name)
    if (!p) return false
    p.uninstall?.(this as unknown as import('../types/spark-component.js').ComponentManager)
    this.plugins.delete(name)
    console.log(`🗑️ Uninstalled SPARK plugin: ${name}`)
    return true
  }
  get(name: string) { return this.plugins.get(name) }
  has(name: string) { return this.plugins.has(name) }
  getAll() { return Array.from(this.plugins.values()) }
  registerHook<K extends keyof PluginHooks>(hookName: K, hook: NonNullable<PluginHooks[K]>) {
    const prev = this.hooks[hookName] as Function | undefined
    if (prev) {
      const prevFn = prev as (...args: unknown[]) => unknown
      const hookFn = hook as (...args: unknown[]) => unknown
      this.hooks[hookName] = (...args: unknown[]) => { prevFn(...args); hookFn(...args) }
    } else this.hooks[hookName] = hook as (...args: unknown[]) => unknown
  }
  async executeHook<K extends keyof PluginHooks>(hookName: K, ...args: Parameters<NonNullable<PluginHooks[K]>>) {
    const fn = this.hooks[hookName] as Function | undefined
    if (!fn) return
    try { await (fn as (...args: unknown[]) => Promise<unknown>)(...args) } catch (e: unknown) { console.error(`Plugin hook '${String(hookName)}' execution failed:`, String(e)) }
  }
  clear() { Array.from(this.plugins.keys()).forEach(k => this.uninstall(k)) }
}

export class SparkDebugPlugin {
  name = 'debug'
  version = '1.0.0'
  description = 'Component debugging and inspection plugin'
  install(m: SparkPluginManager) {
    m.registerHook('afterComponentCreate', (_cfg: import('../types/spark-component.js').ComponentConfig, ctx: ComponentContext) => {
      console.log(`🐛 [DEBUG] Component created: ${ctx.type} (${ctx.id})`)
    })
  }
}

export class SparkPerformancePlugin {
  name = 'performance'
  version = '1.0.0'
  description = 'Component performance monitoring plugin'
  private metrics = new Map<string, unknown>()
  install(_m: SparkPluginManager) {
    // minimal implementation
  }
  getMetrics(id: string) { return this.metrics.get(id) }
  getAllMetrics() { return new Map(this.metrics) }
}

export class SparkErrorHandlingPlugin {
  name = 'error-handling'
  version = '1.0.0'
  description = 'Unified error handling for components'
  private errorHandlers: unknown[] = []
  install(_m: SparkPluginManager) {
    // register hooks as needed
  }
  addErrorHandler(h: unknown) { this.errorHandlers.push(h) }
  removeErrorHandler(h: unknown) { const i = this.errorHandlers.indexOf(h); if (i>-1) this.errorHandlers.splice(i,1) }
}

export const globalPluginManager = new SparkPluginManager()
export function installSparkPlugin(p: Plugin) { globalPluginManager.install(p) }
export function uninstallSparkPlugin(name: string) { return globalPluginManager.uninstall(name) }
export function getSparkPlugin(name: string) { return globalPluginManager.get(name) }

export type { Plugin, PluginHooks } from '../types/spark-component.js'
