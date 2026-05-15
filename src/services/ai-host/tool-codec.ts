import {
  createAiRuntimeToolCodec,
  type AiRuntimeKnowledgeProjection,
  type AiRuntimeToolCodec,
  type AiRuntimeToolCodecOptions,
} from '@spark-view/spark-ai'
import type { AppAiTransportToolSpec } from './types'

export interface AppAiToolCodec extends Omit<AiRuntimeToolCodec, 'tools'> {
  readonly tools: readonly AppAiTransportToolSpec[]
}

export type AppAiToolCodecOptions = AiRuntimeToolCodecOptions

export function createAppAiToolCodec(
  projection: AiRuntimeKnowledgeProjection,
  options: AppAiToolCodecOptions = {},
): AppAiToolCodec {
  return createAiRuntimeToolCodec(projection, options) as AppAiToolCodec
}
