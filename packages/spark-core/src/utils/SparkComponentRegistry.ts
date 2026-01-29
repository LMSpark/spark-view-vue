import type { SparkComponentDefinition, SparkComponentRegistry } from '../types/spark-component.js'
import { getLogger } from './logger.js'

class SparkComponentRegistryImpl implements SparkComponentRegistry {
  private components = new Map<string, SparkComponentDefinition>()
  private logger = getLogger()

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
export function registerSparkComponent(def: SparkComponentDefinition): void {
  globalComponentRegistry.register(def.type, def)
}
export function getSparkComponent(type: string): any {
  return globalComponentRegistry.get(type)?.component
}
export function registerSparkComponents(defs: SparkComponentDefinition[]): void {
  defs.forEach(d => registerSparkComponent(d))
}
export function isSparkComponentsInitialized(): boolean {
  return globalComponentRegistry.getAllTypes().length > 0
}
export function initializeSparkComponents(): Promise<void> {
  // noop for now; application can call to perform app-specific initialization
  return Promise.resolve()
}
