import { coreKnowledgeStills } from '../knowledge/query-actions'
import { registerAll } from './dispatcher'
import { interactionAsk, sessionDescribe } from './meta-methods'

export const coreMetaStills = [
  ...coreKnowledgeStills,
  sessionDescribe,
  interactionAsk,
] as const

export function registerCoreStills(): void {
  registerAll(coreMetaStills)
}