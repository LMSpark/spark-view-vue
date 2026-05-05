import type { RegisteredFunctionDefinition } from '../protocol/function-contracts'
import { registerFunctions } from '../registry/function-registry'
import { coreKnowledgeFunctions } from './query-actions'

export function registerCoreKnowledgeFunctions(): void {
  registerFunctions(coreKnowledgeFunctions as unknown as ReadonlyArray<RegisteredFunctionDefinition<unknown, unknown>>)
}