import type { SparkPlugin, SparkPluginHooks, SparkComponentContext } from '../types/spark-component.js'

class SparkPluginManager {
  private plugins = new Map<string, SparkPlugin>()
  private hooks: Partial<Record<keyof SparkPluginHooks, Function>> = {}

  install(plugin: SparkPlugin) {
    if (this.plugins.has(plugin.name)) this.uninstall(plugin.name)
    plugin.install(this)
    this.plugins.set(plugin.name, plugin)
    console.log(`✅ Installed SPARK plugin: ${plugin.name} (${plugin.version})`)
  }
  uninstall(name: string) {
    const p = this.plugins.get(name)
    if (!p) return false
    p.uninstall && p.uninstall(this)
    this.plugins.delete(name)
    console.log(`🗑️ Uninstalled SPARK plugin: ${name}`)
    return true
  }
  get(name: string) { return this.plugins.get(name) }
  has(name: string) { return this.plugins.has(name) }
  getAll() { return Array.from(this.plugins.values()) }
  registerHook<K extends keyof SparkPluginHooks>(hookName: K, hook: NonNullable<SparkPluginHooks[K]>) {
    const prev = this.hooks[hookName]
    if (prev) {
      const prevFn = prev as Function
      const hookFn = hook as Function
      this.hooks[hookName] = (...args: any[]) => { prevFn(...(args as any)); hookFn(...(args as any)) }
    } else this.hooks[hookName] = hook as Function
  }
  async executeHook<K extends keyof SparkPluginHooks>(hookName: K, ...args: Parameters<NonNullable<SparkPluginHooks[K]>>) {
    const fn = this.hooks[hookName]
    if (!fn) return
    try { await (fn as any)(...args) } catch (e) { console.error(`Plugin hook '${String(hookName)}' execution failed:`, e) }
  }
  clear() { Array.from(this.plugins.keys()).forEach(k => this.uninstall(k)) }
}

export class SparkDebugPlugin {
  name = 'debug'
  version = '1.0.0'
  description = 'Component debugging and inspection plugin'
  install(m: SparkPluginManager) {
    m.registerHook('afterComponentCreate', (_cfg, ctx: SparkComponentContext) => {
      console.log(`🐛 [DEBUG] Component created: ${ctx.type} (${ctx.id})`)
    })
  }
}

export class SparkPerformancePlugin {
  name = 'performance'
  version = '1.0.0'
  description = 'Component performance monitoring plugin'
  private metrics = new Map<string, any>()
  install(m: SparkPluginManager) {
    // minimal implementation
  }
  getMetrics(id: string) { return this.metrics.get(id) }
  getAllMetrics() { return new Map(this.metrics) }
}

export class SparkErrorHandlingPlugin {
  name = 'error-handling'
  version = '1.0.0'
  description = 'Unified error handling for components'
  private errorHandlers: any[] = []
  install(m: SparkPluginManager) {
    // register hooks as needed
  }
  addErrorHandler(h: any) { this.errorHandlers.push(h) }
  removeErrorHandler(h: any) { const i = this.errorHandlers.indexOf(h); if (i>-1) this.errorHandlers.splice(i,1) }
}

export const globalPluginManager = new SparkPluginManager()
export function installSparkPlugin(p: SparkPlugin) { globalPluginManager.install(p) }
export function uninstallSparkPlugin(name: string) { return globalPluginManager.uninstall(name) }
export function getSparkPlugin(name: string) { return globalPluginManager.get(name) }

export type { SparkPlugin, SparkPluginHooks } from '../types/spark-component.js'
