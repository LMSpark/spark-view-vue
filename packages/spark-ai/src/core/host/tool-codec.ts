/**
 * Host 层 tool codec 适配器。
 */

import { createAiRuntimeToolCodec } from '../internal/tool-codec'
import type { AiRuntimeToolCodecOptions } from '../internal/tool-codec'
import type { AiRuntimeKnowledgeProjection } from '../internal/runtime-protocol'
import type { AiHostTransportToolSpec } from './types'

export interface AiHostToolCodec {
  readonly tools: readonly AiHostTransportToolSpec[]
  actionOf(toolName: string): string | null
}

export type AiHostToolCodecOptions = AiRuntimeToolCodecOptions

export function createAiHostToolCodec(
  projection: AiRuntimeKnowledgeProjection,
  options: AiHostToolCodecOptions = {},
): AiHostToolCodec {
  return createAiRuntimeToolCodec(projection, options) as AiHostToolCodec
}
