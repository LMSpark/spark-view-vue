import type { SparkComponentDefinition, SparkComponentRegistry } from '../types/spark-component.js'
import { Logger } from './logger.js'

class SparkComponentRegistryImpl implements SparkComponentRegistry {
  private components = new Map<string, SparkComponentDefinition>()
  private logger = Logger()

  register(type: string, definition: SparkComponentDefinition): void {
    if (this.components.has(type)) {
      this.logger.warn(`Component type '${type}' is already registered. Overwriting...`)
    }
    if (!this.validateDefinition(definition)) {
      throw new Error(`Invalid component definition for type '${type}'`)
    }
    this.components.set(type, definition)
    this.logger.info(`✅ Registered SPARK component: ${type} (${definition.version})`)
  }

  get(type: string): SparkComponentDefinition | undefined {
    return this.components.get(type)
  }

  has(type: string): boolean {
    return this.components.has(type)
  }

  getAllTypes(): string[] {
    return Array.from(this.components.keys())
  }

  getAllDefinitions(): SparkComponentDefinition[] {
    return Array.from(this.components.values())
  }

  unregister(type: string): boolean {
    const removed = this.components.delete(type)
    if (removed) this.logger.info(`🗑️ Unregistered SPARK component: ${type}`)
    return removed
  }

  clear(): void {
    this.components.clear()
    this.logger.info('🧹 Cleared all SPARK component registrations')
  }

  private validateDefinition(def: SparkComponentDefinition): boolean {
    if (!def.type) return false
    if (!def.name) return false
    if (!def.version) return false
    if (!def.component) return false
    return true
  }

  private isValidVersion(v: string): boolean {
    return /^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/.test(v)
  }
}

export const globalComponentRegistry = new SparkComponentRegistryImpl()
// NOTE: convenience helpers were removed to avoid duplicating the public namespace API.
// Use `Spark.registerSparkComponent(...)` or `globalComponentRegistry.register(...)` instead.
