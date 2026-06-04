/**
 * ═══════════════════════════════════════════════════════════════
 * tree/tree-policy.ts — 策略解析与默认实现
 * ═══════════════════════════════════════════════════════════════
 */

import type { JsonTreePolicy } from './tree-types'
import { ensureUniqueObjectKey } from './tree-utils'

type ResolvedPolicy = Required<JsonTreePolicy>

const DEFAULT_POLICY: ResolvedPolicy = {
  rootLabel: '$',
  isProtected: () => false,
  canEditKey: (path) => path.length > 0 && typeof path[path.length - 1] === 'string',
  canEditType: (path) => path.length > 0,
  suggestChildKey: (target) => ensureUniqueObjectKey(target, 'newKey'),
  createDefaultArrayItem: () => '',
  createDefaultObjectValue: () => '',
  getValueOptions: () => undefined,
  getValueLabels: () => undefined,
  getAutoPopulate: () => undefined,
}

export function resolvePolicy(partial?: Partial<JsonTreePolicy>): ResolvedPolicy {
  if (!partial) return DEFAULT_POLICY
  return {
    rootLabel: partial.rootLabel ?? DEFAULT_POLICY.rootLabel,
    isProtected: partial.isProtected ?? DEFAULT_POLICY.isProtected,
    canEditKey: partial.canEditKey ?? DEFAULT_POLICY.canEditKey,
    canEditType: partial.canEditType ?? DEFAULT_POLICY.canEditType,
    suggestChildKey: partial.suggestChildKey ?? DEFAULT_POLICY.suggestChildKey,
    createDefaultArrayItem: partial.createDefaultArrayItem ?? DEFAULT_POLICY.createDefaultArrayItem,
    createDefaultObjectValue: partial.createDefaultObjectValue ?? DEFAULT_POLICY.createDefaultObjectValue,
    getValueOptions: partial.getValueOptions ?? DEFAULT_POLICY.getValueOptions,
    getValueLabels: partial.getValueLabels ?? DEFAULT_POLICY.getValueLabels,
    getAutoPopulate: partial.getAutoPopulate ?? DEFAULT_POLICY.getAutoPopulate,
  }
}
