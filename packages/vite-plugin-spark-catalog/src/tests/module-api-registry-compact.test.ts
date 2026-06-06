import { describe, expect, it } from 'vitest'

import { compactModuleMetadataApiRegistry } from '../module-api-registry-compact'

describe('compactModuleMetadataApiRegistry', () => {
  it('dedupes action resultApis into apiRegistry $ref by kind', () => {
    const childApi = {
      className: 'ChildApi',
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
    const inline = {
      schemaVersion: 1 as const,
      rootApi: {
        className: 'RootApi',
        kind: 'root-api',
        name: 'Root',
        description: 'Root API',
        actions: [
          {
            name: 'listRefs',
            methodName: 'listRefs',
            description: 'Return two child handles',
            paramsSchema: { type: 'object', properties: {}, required: [] },
            resultApis: [
              { resultPath: ['first'], api: childApi },
              { resultPath: ['second'], api: childApi },
            ],
          },
        ],
      },
    }

    const compact = compactModuleMetadataApiRegistry(inline)

    expect(compact.schemaVersion).toBe(2)
    expect(compact.rootApi.actions[0]?.resultApis).toEqual([
      { resultPath: ['first'], $ref: 'child-api' },
      { resultPath: ['second'], $ref: 'child-api' },
    ])
    expect(Object.keys(compact.apiRegistry)).toEqual(['child-api'])
    expect(compact.apiRegistry['child-api']?.actions[0]?.name).toBe('search')
    const serialized = JSON.stringify(compact)
    expect(serialized.includes('"$ref":"child-api"')).toBe(true)
    expect(serialized.split('"$ref":"child-api"').length - 1).toBe(2)
  })
})
