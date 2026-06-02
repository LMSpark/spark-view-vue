import { describe, expect, it } from 'vitest'

import { vcmPropertyMetaSchemaToJsonSchema } from '../extract-component-api-vcm'

describe('vcm schema to JSON Schema', () => {
  it('converts VCM kind fields into standard JSON Schema keywords', () => {
    const schema = vcmPropertyMetaSchemaToJsonSchema({
      kind: 'object',
      type: 'DemoNode',
      schema: {
        id: propertyMeta({
          type: 'string',
          required: true,
          description: 'Node id.',
        }),
        mode: propertyMeta({
          type: '"create" | "update"',
          required: false,
          schema: {
            kind: 'enum',
            type: '"create" | "update"',
            schema: ['"create"', '"update"'],
          },
        }),
        children: propertyMeta({
          type: 'ChildNode[]',
          required: false,
          schema: {
            kind: 'array',
            type: 'ChildNode[]',
            schema: [{
              kind: 'object',
              type: 'ChildNode',
              schema: {
                title: propertyMeta({
                  type: 'string',
                  required: true,
                }),
              },
            }],
          },
        }),
      },
    })

    expect(JSON.stringify(schema)).not.toContain('"kind"')
    expect(schema).toMatchObject({
      title: 'DemoNode',
      type: 'object',
      required: ['id'],
      properties: {
        id: {
          type: 'string',
          description: 'Node id.',
        },
        mode: {
          type: 'string',
          enum: ['create', 'update'],
        },
        children: {
          type: 'array',
          items: {
            title: 'ChildNode',
            type: 'object',
            required: ['title'],
          },
        },
      },
    })
  })
})

function propertyMeta(input: {
  type: string
  required: boolean
  description?: string
  schema?: unknown
}) {
  return {
    name: '',
    type: input.type,
    required: input.required,
    description: input.description ?? '',
    global: false,
    tags: [],
    declarations: [],
    default: undefined,
    schema: input.schema,
  } as never
}
