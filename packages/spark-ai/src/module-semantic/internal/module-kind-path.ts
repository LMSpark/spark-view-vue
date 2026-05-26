/**
 * module-semantic · ModuleKind parent topology helpers.
 *
 * LLM-visible tool names and payload lookup steps must be derived from the
 * registered ModuleKind graph. Missing parents and parent cycles are startup
 * configuration errors, not recoverable projection states.
 */

import type { ModuleKind } from '../protocol'

export class ModuleKindTopologyError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'ModuleKindTopologyError'
  }
}

export function resolveModuleKindPath(
  moduleKind: ModuleKind,
  allKinds: readonly ModuleKind[],
): readonly string[] {
  const byKind = new Map(allKinds.map((candidate) => [candidate.kind, candidate]))
  const path = [moduleKind.kind]
  const seen = new Set<string>(path)
  let parentKind = moduleKind.parentKind
  while (parentKind !== undefined) {
    if (seen.has(parentKind)) {
      throw new ModuleKindTopologyError(`ModuleKind parent cycle detected at "${parentKind}"`)
    }
    const parent = byKind.get(parentKind)
    if (parent === undefined) {
      throw new ModuleKindTopologyError(
        `ModuleKind "${moduleKind.kind}" references missing parentKind "${parentKind}"`,
      )
    }
    path.unshift(parent.kind)
    seen.add(parent.kind)
    parentKind = parent.parentKind
  }
  return path
}
