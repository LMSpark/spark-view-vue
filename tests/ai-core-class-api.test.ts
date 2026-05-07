import { describe, expect, it } from 'vitest'

import * as SparkAi from '../packages/spark-ai/src'

describe('ai core class-only public surface', () => {
  it('exposes class-first runtime and knowledge registry only', () => {
    expect('createAiRuntime' in SparkAi).toBe(false)
    expect('createKnowledgePayloadProviderRegistry' in SparkAi).toBe(false)
    expect('getKnowledgePayloadProviderRegistry' in SparkAi).toBe(false)
    expect('registerKnowledgePayloadProvider' in SparkAi).toBe(false)

    expect(typeof SparkAi.AiRuntime).toBe('function')
    expect(typeof SparkAi.KnowledgePayloadRegistry).toBe('function')
    expect(SparkAi.KnowledgePayloadRegistry.defaultRegistry).toBeInstanceOf(SparkAi.KnowledgePayloadRegistry)
  })
})