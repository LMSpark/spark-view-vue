import { describe, expect, it } from 'vitest'

import {
  canUseStructuredPageDataEditor,
  canonicalizePageDataJson,
  canonicalizePageDataValue,
  PAGE_DATA_JSON_SCHEMA,
} from '../src/views/app/dev-system/policies/pageDataJsonSchema'

describe('pageDataJsonSchema', () => {
  it('should reject wrapped dataset text (legacy shape)', () => {
    expect(() => canonicalizePageDataJson(JSON.stringify({
      dataset: {
        dataSetName: 'DemoDS',
        tables: {
          Users: {
            columns: [{ name: 'id', type: 'number' }],
            views: {
              default: {
                rows: [{ id: 1 }],
                autoSelectFirst: true,
              },
            },
          },
        },
      },
    }))).toThrow('不再支持 dataset 包裹结构')

    expect(canUseStructuredPageDataEditor(JSON.stringify({
      dataset: {
        dataSetName: 'DemoDS',
        tables: {},
      },
    }))).toBe(false)
  })

  it('should allow structured editor when pagedata can be canonicalized', () => {
    expect(canUseStructuredPageDataEditor(JSON.stringify({
      dataSetName: 'DemoDS',
      tables: {
        Users: {
          columns: [{ name: 'id', type: 'number' }],
          views: {
            default: {
              rows: [{ id: 1 }],
            },
          },
        },
      },
    }))).toBe(true)
  })

  it('should canonicalize structured pagedata value without text parsing roundtrip', () => {
    const result = canonicalizePageDataValue({
      dataSetName: 'DemoDS',
      tables: {
        Users: {
          columns: [{ name: 'id', type: 'number' }],
          views: {
            default: {
              rows: [{ id: 1 }],
            },
          },
        },
      },
    })

    expect(result.value['dataSetName']).toBe('DemoDS')
    expect(result.text).toContain('"dataSetName": "DemoDS"')
    expect((result.value['tables'] as Record<string, unknown>)['Users']).toBeDefined()
  })

  it('should reject invalid json for structured editor', () => {
    expect(canUseStructuredPageDataEditor('{ invalid json')).toBe(false)
  })

  it('should expose canonical root schema', () => {
    expect(PAGE_DATA_JSON_SCHEMA['type']).toBe('object')
    expect(PAGE_DATA_JSON_SCHEMA['required'] as string[]).toContain('tables')
  })

  it('should expose still-aligned localized schema metadata', () => {
    const properties = PAGE_DATA_JSON_SCHEMA['properties'] as Record<string, Record<string, unknown>>
    const defs = PAGE_DATA_JSON_SCHEMA['$defs'] as Record<string, Record<string, unknown>>
    const tableMetadata = defs['tableMetadata']
    const viewDependency = defs['viewDependency']

    if (!tableMetadata || !viewDependency) {
      throw new Error('缺少 pagedata schema defs')
    }

    const tableMetadataProperties = tableMetadata['properties'] as Record<string, Record<string, unknown>>

    expect(properties['tables']?.['title']).toBe('数据表集合')
    expect(properties['viewDependencies']?.['description']).toContain('ViewDependency')
    expect(tableMetadata['title']).toBe('数据表元数据')
    expect(tableMetadataProperties['resourceType']?.['title']).toBe('资源类型')
    expect(tableMetadataProperties['businessCategory']?.['description']).toContain('主表 / 从表 / 引用表')
    expect(viewDependency['title']).toBe('视图依赖')
  })
})