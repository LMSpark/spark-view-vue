import type { IStillSession, SessionDomainState } from '../../core/stills/types'

interface BlueprintCheckpointStateLike {
  status?: string
}

interface BlueprintDataLike {
  checkpoints?: BlueprintCheckpointStateLike[]
}

interface BlueprintDomainStateLike extends SessionDomainState<string> {
  data?: BlueprintDataLike | null
}

function readBlueprintCheckpoints(session: IStillSession): BlueprintCheckpointStateLike[] | null {
  const state = session.domains['blueprint'] as BlueprintDomainStateLike | undefined
  if (!state?.data) {
    return null
  }

  return Array.isArray(state.data.checkpoints) ? state.data.checkpoints : null
}

export function hasPendingBlueprintCheckpoints(session: IStillSession): boolean {
  const checkpoints = readBlueprintCheckpoints(session)
  if (checkpoints === null) {
    return false
  }

  return checkpoints.some((checkpoint) => checkpoint.status !== 'done')
}

export function hasCompletedBlueprintCheckpoints(session: IStillSession): boolean {
  const checkpoints = readBlueprintCheckpoints(session)
  if (checkpoints === null) {
    return false
  }

  return checkpoints.every((checkpoint) => checkpoint.status === 'done')
}