import { describe, expect, it } from 'vitest'

import {
  AiModulePayloadRegistry,
  AiModuleRuntime,
  createPayloadCatalogModule,
  type AiModulePayloadProvider,
} from '../modules'

describe('createPayloadCatalogModule', () => {
  it('routes queryPayloads and guidePayload through registry', async () => {
    const provider: AiModulePayloadProvider = {
      moduleKind: 'node-tree',
      payloadRef: 'spark.component',
      description: 'demo catalog',
      queryPayloads: () => [{
        moduleKind: 'node-tree',
        payloadRef: 'spark.component',
        key: 'r-text',
        description: 'Text field',
        category: 'field',
      }],
      guidePayload: (key) => key === 'r-text'
        ? {
          moduleKind: 'node-tree',
          payloadRef: 'spark.component',
          key: 'r-text',
          description: 'Text field guide',
          paramsSchema: {
            type: 'object',
            properties: { type: { type: 'string', const: 'r-text' } },
            required: ['type'],
          },
        }
        : null,
    }

    const registry = new AiModulePayloadRegistry()
    registry.register(provider)
    const runtime = new AiModuleRuntime()
    runtime.register(createPayloadCatalogModule({
      kind: 'spark-component',
      name: 'Spark Component Catalog',
      description: 'Vue component payload catalog.',
      registry,
    }))

    const inspect = runtime.inspect()
    expect(inspect.ok).toBe(true)

    const catalogPath = '/spark-component[catalog]'
    const queryResult = await runtime.executeTool('queryPayloads', {
      path: catalogPath,
      args: {
        moduleKind: 'node-tree',
        payloadRef: 'spark.component',
        keyword: 'text',
      },
    })
    expect(queryResult.ok).toBe(true)
    expect(Array.isArray(queryResult.data)).toBe(true)

    const guideResult = await runtime.executeTool('guidePayload', {
      path: catalogPath,
      args: {
        moduleKind: 'node-tree',
        payloadRef: 'spark.component',
        key: 'r-text',
      },
    })
    expect(guideResult.ok).toBe(true)
    expect(guideResult.data).toMatchObject({ key: 'r-text' })

    const knowledge = runtime.projectKnowledge()
    expect(knowledge.promptSnapshot).toContain('spark-component')
    expect(knowledge.modules.some(module => module.kind === 'spark-component')).toBe(true)
  })
})
