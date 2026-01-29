import type { SparkCapabilityProvider, SparkProviderInterface } from '../types/spark-component.js'

const globalProviders = new Map<string, SparkCapabilityProvider>()

export function registerGlobalProvider(name: string, provider: SparkCapabilityProvider): void {
  globalProviders.set(name, provider)
}

export function getGlobalProvider(name: string): SparkCapabilityProvider | undefined {
  return globalProviders.get(name)
}

export function getOrCreateNoopProvider(name: string, interfaceSpec: SparkProviderInterface = {}): SparkCapabilityProvider {
  let p = globalProviders.get(name)
  if (!p) {
    p = { name, version: '0.0.0', interface: interfaceSpec, implementation: {} }
    globalProviders.set(name, p)
  }
  return p
}
