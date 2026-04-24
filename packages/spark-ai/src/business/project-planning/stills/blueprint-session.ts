import type { DomainState, IStillSession } from '../../../core/stills/types'
import type { ExecutionBlueprint } from './blueprint-types'

/** 统一读取 blueprint 域数据；不存在 blueprint 域时返回 null。 */
export function readSessionBlueprint(session: IStillSession): ExecutionBlueprint | null {
  const state = session.domains['blueprint']
  if (!state) return null
  return (state as DomainState<ExecutionBlueprint | null, string>).data
}

/** 统一写入 blueprint 域数据；不存在 blueprint 域时 fail-fast。 */
export function writeSessionBlueprint(session: IStillSession, blueprint: ExecutionBlueprint | null): void {
  const state = session.domains['blueprint']
  if (!state) {
    throw new Error('Blueprint domain state is missing in current still session')
  }
  (state as DomainState<ExecutionBlueprint | null, string>).data = blueprint
}

/** 仅要求 blueprint 已创建。 */
export function requireBlueprint(session: IStillSession): { code: string; msg: string } | null {
  if (readSessionBlueprint(session) === null) {
    return { code: 'NO_BLUEPRINT', msg: 'Blueprint 尚未创建，请先执行 blueprint.create' }
  }
  return null
}
