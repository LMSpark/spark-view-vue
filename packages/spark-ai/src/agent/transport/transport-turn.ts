/**
 * AI turn wire identity projection.
 *
 * spark-ai owns the pure key format so APP and script bridges do not duplicate
 * turnKey/streamKey construction while still keeping HTTP I/O outside the package.
 */

import { createAiAgentStreamKey, createAiAgentTurnKey } from '../business/business-scope'
import type { AiAgentStreamTurnInput } from './transport-types'

export type AiAgentTransportTurn = Readonly<{
  turnId: string
  turnKey: string
  streamKey?: string
}>

export function createAiAgentTransportTurn(
  input: Pick<AiAgentStreamTurnInput, 'scope' | 'turn'>,
  streamId?: string,
): AiAgentTransportTurn {
  return {
    turnId: input.turn.turnId,
    turnKey: createAiAgentTurnKey(input.scope, input.turn.turnId),
    ...(streamId === undefined ? {} : {
      streamKey: createAiAgentStreamKey(input.scope, input.turn.turnId, streamId),
    }),
  }
}
