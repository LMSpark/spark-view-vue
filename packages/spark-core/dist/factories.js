import { SparkComponentRegistryImpl } from './utils/SparkComponentRegistry.js';
import { SparkComponentManagerImpl } from './utils/SparkComponentManager.js';
/**
 * Create a new, isolated component registry instance.
 * Prefer creating a dedicated registry when you want isolated test fixtures or alternative lifecycles.
 */
export function createComponentRegistry() {
    return new SparkComponentRegistryImpl();
}
/**
 * Create a new component manager instance. Optionally pass a renderer (e.g., test renderer) implementation.
 */
export function createComponentManager(renderer, registry) {
    return new SparkComponentManagerImpl(renderer, registry);
}
// NOTE: default convenience singletons (`defaultComponentRegistry` / `defaultComponentManager`) removed
// Consumers must create and provide their own instances via `createComponentRegistry()` and `createComponentManager()`.
// This is intentional breaking change to enforce DI and test isolation.
