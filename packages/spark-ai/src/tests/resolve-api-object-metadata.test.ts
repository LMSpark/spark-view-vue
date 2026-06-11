import { describe, expect, it } from 'vitest'

import { resolveModuleMetadataJson, type AiModuleMetadataJson } from '../vcm-native'

describe('resolveModuleMetadataJson', () => {
  it('expands apiRegistry $ref into inline resultApis for adapter consumption', () => {
    const childApi: AiModuleMetadataJson['rootApi'] = {
      className: 'child-api',
      kind: 'child-api',
      name: 'Child',
      description: 'Child API',
      actions: [
        {
          name: 'search',
          methodName: 'search',
          description: 'Search',
          paramsSchema: { type: 'object', properties: {}, required: [] },
        },
      ],
    }

    const resolved = resolveModuleMetadataJson({
      schemaVersion: 2,
      rootApi: {
        className: 'root-api',
        kind: 'root-api',
        name: 'Root',
        description: 'Root API',
        actions: [
          {
            name: 'getChild',
            methodName: 'getChild',
            description: 'Return child',
            paramsSchema: { type: 'object', properties: {}, required: [] },
            resultApis: [{ resultPath: [], $ref: 'child-api' }],
          },
        ],
      },
      apiRegistry: {
        'child-api': childApi,
      },
    })

    expect(resolved.schemaVersion).toBe(1)
    expect(resolved.apiRegistry).toBeUndefined()
    const resultApi = resolved.rootApi.actions[0]?.resultApis?.[0]
    expect(resultApi?.api?.kind).toBe('child-api')
    expect(resultApi?.api?.actions[0]?.name).toBe('search')
  })
})
