import { SparkComponentRegistryImpl, componentRegistry } from './utils/SparkComponentRegistry.js'
import { SparkComponentManagerImpl, componentManager } from './utils/SparkComponentManager.js'
import type { IComponentRegistry, IComponentManager } from './types/interfaces.js'

/**
 * Create a new, isolated component registry instance.
 * Prefer creating a dedicated registry when you want isolated test fixtures or alternative lifecycles.
 */
export function createComponentRegistry(): IComponentRegistry {
  return new SparkComponentRegistryImpl()
}

/**
 * Create a new component manager instance. Optionally pass a renderer (e.g., test renderer) implementation.
 */
export function createComponentManager(renderer?: unknown): IComponentManager {
  return new SparkComponentManagerImpl(renderer)
}

/**
 * Convenience singletons (backing existing code). Consumers are encouraged to create their own instances via factories.
 */
export const defaultComponentRegistry: IComponentRegistry = componentRegistry
export const defaultComponentManager: IComponentManager = componentManager
