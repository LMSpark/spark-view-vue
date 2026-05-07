import { registerFunctions } from '../function/registry'
import { coreKnowledgeFunctions } from './actions'

export function registerCoreKnowledgeFunctions(): void {
  registerFunctions(coreKnowledgeFunctions)
}