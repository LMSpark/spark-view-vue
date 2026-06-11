/**
 * @module @spark-appworks/spark-app:navigation/action-registry
 * @spark-appworks/spark-app 的 navigation/action-registry 模块。
 * 导出 ClassModel symbol: NavigationActionContext, NavigationActionHandler, NavigationActionRegistry（共 3 个 symbol）。
 */
import type { InjectionKey } from 'vue'
import type { ProjectNodeData } from '@spark-appworks/spark-project-model'

/** Navigation Action Context 的运行上下文。 */
export type NavigationActionContext = {
    /** command 字段。 */
command: string
    /** node 字段。 */
node?: ProjectNodeData
    /** 来源对象。 */
source?: 'navigation' | 'toolbar' | 'user-menu' | 'app-shell'}

/** Navigation Action Handler 的回调函数契约。 */
export type NavigationActionHandler = {
  (context: NavigationActionContext): void | Promise<void>}

/** Navigation Action Registry 的语义模型。 */
export type NavigationActionRegistry = {
  register(command: string, handler: NavigationActionHandler): () => void
  unregister(command: string): boolean
  has(command: string): boolean
  execute(command: string, context?: Omit<NavigationActionContext, 'command'>): Promise<boolean>
  getCommands(): string[]}

function normalizeCommand(command: string): string {
  return command.trim()
}

export function createNavigationActionRegistry(): NavigationActionRegistry {
  const handlers = new Map<string, NavigationActionHandler>()

  return {
    register(command, handler) {
      const normalized = normalizeCommand(command)
      if (normalized === '') {
        throw new Error('[NavigationActionRegistry] command is required')
      }
      handlers.set(normalized, handler)
      return () => {
        if (handlers.get(normalized) === handler) {
          handlers.delete(normalized)
        }
      }
    },
    unregister(command) {
      return handlers.delete(normalizeCommand(command))
    },
    has(command) {
      return handlers.has(normalizeCommand(command))
    },
    async execute(command, context = {}) {
      const normalized = normalizeCommand(command)
      const handler = handlers.get(normalized)
      if (handler === undefined) return false
      await handler({ ...context, command: normalized })
      return true
    },
    getCommands() {
      return Array.from(handlers.keys())
    },
  }
}

export const NAVIGATION_ACTION_REGISTRY_KEY: InjectionKey<NavigationActionRegistry> = Symbol('spark-navigation-actions')
