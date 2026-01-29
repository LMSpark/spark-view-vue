import type { Component } from 'vue'

interface ComponentRegistry {
  [componentType: string]: Component
}

const componentRegistry: ComponentRegistry = {}

function registerSparkComponentImpl(type: string, component: Component): void {
  if (componentRegistry[type]) {
    console.warn(`⚠️ SPARK Component '${type}' is already registered. Overwriting...`)
  }
  componentRegistry[type] = component
  console.log(`📝 Registered SPARK Component: ${type}`)
}

function getSparkComponentImpl(type: string): any | undefined {
  return componentRegistry[type]
}

function getRegisteredComponentTypesImpl(): string[] {
  return Object.keys(componentRegistry)
}

function isComponentRegisteredImpl(type: string): boolean {
  return type in componentRegistry
}

function registerSparkComponentsImpl(components: Record<string, Component>): void {
  Object.entries(components).forEach(([type, component]) => {
    registerSparkComponentImpl(type, component)
  })
}

function get(type: string) {
  const component = componentRegistry[type]
  if (!component) return undefined
  return { type, component }
}

function has(type: string) { return type in componentRegistry }

function getAllTypes() { return Object.keys(componentRegistry) }

function getAllDefinitions() { return Object.keys(componentRegistry).map(t => ({ type: t, component: componentRegistry[t] })) }

function unregister(type: string) { const had = !!componentRegistry[type]; delete componentRegistry[type]; return had }

function findCompatibleProviders(capabilityName: string, minVersion?: string) {
  // Not implemented: simple stub returns []
  return []
}

export const globalComponentRegistry = {
  register: registerSparkComponentImpl,
  get: get,
  has: has,
  getAllTypes,
  getAllDefinitions,
  unregister,
  findCompatibleProviders
}

export { registerSparkComponentImpl as registerSparkComponent, getSparkComponentImpl as getSparkComponent, getRegisteredComponentTypesImpl as getRegisteredComponentTypes, isComponentRegisteredImpl as isComponentRegistered, registerSparkComponentsImpl as registerSparkComponents }
