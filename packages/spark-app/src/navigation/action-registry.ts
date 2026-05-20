import type { InjectionKey } from 'vue'
import type { NavNode } from './nav-model'

export interface NavigationActionContext {
  command: string
  node?: NavNode
  source?: 'navigation' | 'toolbar' | 'user-menu' | 'app-shell'
}

export interface NavigationActionHandler {
  (context: NavigationActionContext): void | Promise<void>
}

export interface NavigationActionRegistry {
  register(command: string, handler: NavigationActionHandler): () => void
  unregister(command: string): boolean
  has(command: string): boolean
  execute(command: string, context?: Omit<NavigationActionContext, 'command'>): Promise<boolean>
  getCommands(): string[]
}

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
