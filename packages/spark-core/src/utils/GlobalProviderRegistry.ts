import type { CapabilityProvider } from '../types/common.js'
import type { CapabilityInterface } from '../types/common.js'

const globalProviders = new Map<string, CapabilityProvider>()

export function registerGlobalProvider(name: string, provider: CapabilityProvider): void {
  globalProviders.set(name, provider)
}

export function getGlobalProvider(name: string): CapabilityProvider | undefined {
  return globalProviders.get(name)
}

export function getOrCreateNoopProvider(name: string, interfaceSpec: CapabilityInterface = {}): CapabilityProvider {
  let p = globalProviders.get(name)
  if (!p) {
    p = { name, version: '0.0.0', interface: interfaceSpec, implementation: {} }
    globalProviders.set(name, p)
  }
  return p
}
