import { describe, expect, it } from 'vitest'

import { compactModuleMetadataApiRegistry } from '../module-api-registry-compact'

describe('compactModuleMetadataApiRegistry', () => {
  it('dedupes action resultApis into apiRegistry $ref by kind', () => {
    const childApi = {
      className: 'ChildApi',
      kind: 'child-api',
      name: 'Child',
      description: 'Child API',
      jsdoc: '/** Child API. */',
      provenance: { file: 'src/child.ts', line: 1, className: 'ChildApi' },
      actions: [
        {
          name: 'search',
          methodName: 'search',
          description: 'Search',
          jsdoc: '/** Search child API. */',
          provenance: { file: 'src/child.ts', line: 5, className: 'ChildApi', memberName: 'search' },
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
        jsdoc: '/** Root API. */',
        provenance: { file: 'src/root.ts', line: 1, className: 'RootApi' },
        constructorSignature: {
          description: 'Create root API.',
          jsdoc: '/** Create root API. */',
          paramsSchema: { type: 'object', properties: {}, required: [] },
        },
        attributes: [
          {
            name: 'child',
            description: 'Child attribute.',
            jsdoc: '/** Child attribute. */',
            schema: { type: 'object' },
            readable: true,
            writable: false,
            api: childApi,
          },
        ],
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
    expect(compact.rootApi.jsdoc).toBe('/** Root API. */')
    expect('provenance' in compact.rootApi).toBe(false)
    expect(compact.rootApi.constructorSignature?.jsdoc).toBe('/** Create root API. */')
    expect(compact.rootApi.attributes?.[0]?.jsdoc).toBe('/** Child attribute. */')
    expect(Object.keys(compact.apiRegistry)).toEqual(['child-api'])
    expect(compact.apiRegistry['child-api']?.jsdoc).toBe('/** Child API. */')
    expect('provenance' in (compact.apiRegistry['child-api'] ?? {})).toBe(false)
    expect(compact.apiRegistry['child-api']?.actions[0]?.name).toBe('search')
    expect(compact.apiRegistry['child-api']?.actions[0]?.jsdoc).toBe('/** Search child API. */')
    const serialized = JSON.stringify(compact)
    expect(serialized.includes('"$ref":"child-api"')).toBe(true)
    expect(serialized.split('"$ref":"child-api"').length - 1).toBe(2)
    expect(serialized).not.toContain('"raw"')
    expect(serialized).not.toContain('"tags"')
    expect(serialized).not.toContain('"provenance"')
  })
})
