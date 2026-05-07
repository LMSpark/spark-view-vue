import type { RegisteredFunctionDefinition } from './contracts'

const registry = new Map<string, RegisteredFunctionDefinition<unknown, unknown>>()

export function registerFunction(definition: RegisteredFunctionDefinition<unknown, unknown>): void {
  registry.set(definition.action, definition)
}

export function registerFunctions(definitions: ReadonlyArray<RegisteredFunctionDefinition<unknown, unknown>>): void {
  for (const definition of definitions) {
    registry.set(definition.action, definition)
  }
}

export function getFunctionDefinition(action: string): RegisteredFunctionDefinition<unknown, unknown> | undefined {
  return registry.get(action)
}

export function getAllFunctionDefinitions(): ReadonlyMap<string, RegisteredFunctionDefinition<unknown, unknown>> {
  return registry
}

export function clearFunctionRegistry(): void {
  registry.clear()
}