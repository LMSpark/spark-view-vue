import { Logger } from '@spark-view/spark-utils'
import type { Plugin, PluginHooks, ComponentManager } from '../types/spark-component.js'

const logger = Logger('Spark:Plugin')

/**
 * SPARK 插件管理器
 * 
 * 职责：管理插件的生命周期（安装、卸载、钩子执行）
 * 
 * 架构设计：
 * - 通过依赖注入接收 ComponentManager 引用
 * - 插件的 install/uninstall 方法接收真实的 ComponentManager 实例
 * - 支持插件钩子系统（afterComponentCreate, beforeComponentDestroy 等）
 * 
 * @example
 * ```typescript
 * const manager = new SparkPluginManager(componentManager)
 * manager.install({
 *   name: 'my-plugin',
 *   install(mgr) {
 *     mgr.registerComponent({ type: 'custom', ... })
 *   }
 * })
 * ```
 */
export class SparkPluginManager {
  private plugins = new Map<string, Plugin>()
  private hooks: Partial<Record<keyof PluginHooks, Function>> = {}
  private manager: ComponentManager

  constructor(manager: ComponentManager) {
    this.manager = manager
  }

  install(plugin: Plugin) {
    if (this.plugins.has(plugin.name)) this.uninstall(plugin.name)
    plugin.install?.(this.manager)
    this.plugins.set(plugin.name, plugin)
    logger.info(`✅ Installed SPARK plugin: ${plugin.name}`)
  }
  uninstall(name: string) {
    const p = this.plugins.get(name)
    if (!p) return false
    p.uninstall?.(this.manager)
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

// Global plugin manager will be initialized lazily to avoid circular dependencies
let globalPluginManager: SparkPluginManager | undefined
let initPromise: Promise<SparkPluginManager> | undefined

async function getGlobalPluginManager(): Promise<SparkPluginManager> {
  if (globalPluginManager) return globalPluginManager
  
  // Ensure we only initialize once even if called multiple times
  initPromise ??= (async () => {
    // Lazy import to avoid circular dependency
    const { componentManager } = await import('../utils/SparkComponentManager.js')
    globalPluginManager = new SparkPluginManager(componentManager)
    return globalPluginManager
  })()
  
  return initPromise
}

export async function installSparkPlugin(p: Plugin) { 
  const manager = await getGlobalPluginManager()
  manager.install(p)
}
export async function uninstallSparkPlugin(name: string) { 
  const manager = await getGlobalPluginManager()
  return manager.uninstall(name)
}
export async function getSparkPlugin(name: string) { 
  const manager = await getGlobalPluginManager()
  return manager.get(name)
}
