/**
 * AI turn wire identity projection.
 *
 * spark-ai owns the pure key format so APP and script bridges do not duplicate
 * turnKey/streamKey construction while still keeping HTTP I/O outside the package.
 */

import { createAiHostStreamKey, createAiHostTurnKey } from '../business/business-scope'
import type { AiHostStreamTurnInput } from './transport-types'

export type AiHostTransportTurn = Readonly<{
  turnId: string
  turnKey: string
  streamKey?: string
}>

export function createAiHostTransportTurn(
  input: Pick<AiHostStreamTurnInput, 'scope' | 'turn'>,
  streamId?: string,
): AiHostTransportTurn {
  return {
    turnId: input.turn.turnId,
    turnKey: createAiHostTurnKey(input.scope, input.turn.turnId),
    ...(streamId === undefined ? {} : {
      streamKey: createAiHostStreamKey(input.scope, input.turn.turnId, streamId),
    }),
  }
}
