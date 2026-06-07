import { describe, expect, it } from 'vitest'

import { mergeModuleSchemaDefs, poolModuleMetadataSchemas } from '../module-schema-pool'

describe('poolModuleMetadataSchemas', () => {
  it('keeps Draft 2020-12 primitive schemas inline', () => {
    const module = {
      schemaVersion: 2,
      rootApi: {
        kind: 'project',
        attributes: [
          {
            name: 'projectId',
            description: 'Project id',
            readable: true,
            writable: false,
            schema: { type: 'string' },
          },
        ],
        actions: [
          {
            name: 'open',
            paramsSchema: {
              type: 'object',
              properties: {
                pageId: { type: 'string' },
              },
              required: ['pageId'],
            },
            resultSchema: {
              type: 'object',
              title: 'ConfigPageNode',
            },
          },
        ],
      },
      apiRegistry: {},
    }

    const pooled = poolModuleMetadataSchemas(module)
    const action = pooled.module.rootApi.actions[0]
    const attribute = pooled.module.rootApi.attributes?.[0]

    expect(attribute?.schema).toEqual({ type: 'string' })
    expect(action?.paramsSchema).toEqual({
      type: 'object',
      properties: {
        pageId: { type: 'string' },
      },
      required: ['pageId'],
    })
    expect(action?.resultSchema).toEqual({ type: 'object', title: 'ConfigPageNode' })
    expect(pooled.defs.JsonSchema_string).toBeUndefined()
    expect(JSON.stringify(pooled.module).includes('"$defs"')).toBe(false)
  })

  it('keeps repeated primitive fields inline without JsonSchema_* defs', () => {
    const module = {
      schemaVersion: 2,
      rootApi: {
        kind: 'project',
        actions: [
          {
            name: 'a',
            paramsSchema: {
              type: 'object',
              properties: {
                left: { type: 'string' },
                right: { type: 'string' },
              },
            },
          },
        ],
      },
      apiRegistry: {},
    }

    const pooled = poolModuleMetadataSchemas(module)
    expect(pooled.defs.JsonSchema_string).toBeUndefined()
    expect(pooled.module.rootApi.actions[0]?.paramsSchema).toEqual({
      type: 'object',
      properties: {
        left: { type: 'string' },
        right: { type: 'string' },
      },
    })
  })

  it('pools complex named schemas with inline primitive properties', () => {
    const complexNode = {
      type: 'object',
      title: 'DataViewRow',
      properties: {
        id: { type: 'string' },
        label: { type: 'string' },
        nested: {
          type: 'object',
          properties: {
            count: { type: 'number' },
            active: { type: 'boolean' },
          },
        },
      },
      required: ['id'],
    }

    const module = {
      schemaVersion: 2,
      rootApi: {
        kind: 'project',
        actions: [
          { name: 'a', resultSchema: complexNode },
          { name: 'b', resultSchema: complexNode },
        ],
      },
      apiRegistry: {},
    }

    const pooled = poolModuleMetadataSchemas(module)
    expect(pooled.module.rootApi.actions[0]?.resultSchema).toEqual({ $ref: '#/$defs/DataViewRow' })
    expect(pooled.defs.DataViewRow).toMatchObject({
      type: 'object',
      title: 'DataViewRow',
      properties: {
        id: { type: 'string' },
        label: { type: 'string' },
        nested: {
          type: 'object',
          properties: {
            count: { type: 'number' },
            active: { type: 'boolean' },
          },
        },
      },
    })
    expect(pooled.defs.JsonSchema_string).toBeUndefined()
  })

  it('pools duplicate array wrappers into shared ArrayOf_* defs', () => {
    const element = {
      type: 'object',
      title: 'ProjectPageNodeSummary',
      properties: {
        pageId: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['pageId'],
    }

    const module = {
      schemaVersion: 2,
      rootApi: {
        kind: 'project',
        actions: [
          { name: 'a', resultSchema: { type: 'array', items: element } },
          { name: 'b', resultSchema: { type: 'array', items: element } },
        ],
      },
      apiRegistry: {},
    }

    const pooled = poolModuleMetadataSchemas(module)
    const arrayRef = { $ref: '#/$defs/ArrayOf_ProjectPageNodeSummary' }

    expect(pooled.module.rootApi.actions[0]?.resultSchema).toEqual(arrayRef)
    expect(pooled.defs.ArrayOf_ProjectPageNodeSummary).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ProjectPageNodeSummary' },
    })
  })

  it('pools primitive arrays with inline item schemas in ArrayOf_* defs', () => {
    const module = {
      schemaVersion: 2,
      rootApi: {
        kind: 'project',
        attributes: [
          {
            name: 'tags',
            schema: { type: 'array', items: { type: 'string' } },
            readable: true,
            writable: false,
          },
        ],
        actions: [],
      },
      apiRegistry: {},
    }

    const pooled = poolModuleMetadataSchemas(module)
    expect(pooled.module.rootApi.attributes?.[0]?.schema).toEqual({
      $ref: '#/$defs/ArrayOf_string',
    })
    expect(pooled.defs.ArrayOf_string).toEqual({
      type: 'array',
      items: { type: 'string' },
    })
  })

  it('keeps the richer schema when duplicate $def names conflict', () => {
    const rich = {
      type: 'object',
      title: 'HttpEndpoint',
      properties: {
        url: { type: 'string' },
        method: { type: 'string' },
      },
      required: ['url'],
    }
    const stub = {
      type: 'object',
      title: 'HttpEndpoint',
    }

    const first = poolModuleMetadataSchemas({
      schemaVersion: 2,
      rootApi: {
        kind: 'project',
        actions: [{ name: 'a', resultSchema: stub }],
      },
      apiRegistry: {},
    })
    const second = poolModuleMetadataSchemas({
      schemaVersion: 2,
      rootApi: {
        kind: 'dataset',
        actions: [{ name: 'b', resultSchema: rich }],
      },
      apiRegistry: {},
    })

    const defs = mergeModuleSchemaDefs([first, second])
    expect(defs.HttpEndpoint).toMatchObject({
      type: 'object',
      properties: {
        url: { type: 'string' },
        method: { type: 'string' },
      },
    })
  })

  it('pools unconstrained arrays as ArrayOf_any with items true', () => {
    const module = {
      schemaVersion: 2,
      rootApi: {
        kind: 'project',
        attributes: [
          {
            name: 'tags',
            schema: { type: 'array' },
            readable: true,
            writable: false,
          },
        ],
        actions: [],
      },
      apiRegistry: {},
    }

    const pooled = poolModuleMetadataSchemas(module)
    expect(pooled.module.rootApi.attributes?.[0]?.schema).toEqual({
      $ref: '#/$defs/ArrayOf_any',
    })
    expect(pooled.defs.ArrayOf_any).toEqual({
      type: 'array',
      items: true,
    })
  })
})
