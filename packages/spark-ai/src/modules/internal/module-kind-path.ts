/**
 * module-semantic · AiModule parent topology helpers.
 *
 * LLM-visible tool names and payload lookup steps must be derived from the
 * registered AiModule graph. Missing parents and parent cycles are startup
 * configuration errors, not recoverable projection states.
 */

import type { AiModule } from '../protocol'

class AiModuleTopologyError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'AiModuleTopologyError'
  }
}

export function resolveAiModulePath(
  moduleKind: AiModule,
  allKinds: readonly AiModule[],
): readonly string[] {
  const byKind = new Map(allKinds.map((candidate) => [candidate.kind, candidate]))
  const path = [moduleKind.kind]
  const seen = new Set<string>(path)
  let parentKind = moduleKind.parentKind
  while (parentKind !== undefined) {
    if (seen.has(parentKind)) {
      throw new AiModuleTopologyError(`AiModule parent cycle detected at "${parentKind}"`)
    }
    const parent = byKind.get(parentKind)
    if (parent === undefined) {
      throw new AiModuleTopologyError(
        `AiModule "${moduleKind.kind}" references missing parentKind "${parentKind}"`,
      )
    }
    path.unshift(parent.kind)
    seen.add(parent.kind)
    parentKind = parent.parentKind
  }
  return path
}
