import { describe, expect, it } from 'vitest'

import type {
  ComponentCatalog,
  ComponentEntry,
  PlatformConstraints,
} from '../packages/vite-plugin-spark-catalog/src/index'
import {
  projectFcDirectory,
  projectFcSpec,
  projectDevTypes,
  projectDevPropNames,
  projectDevPropEnums,
} from '../packages/spark-ai/src/catalog/catalog-projections'

function makeConstraints(overrides?: Partial<PlatformConstraints>): PlatformConstraints {
  return {
    dataKeyPattern: String.raw`^(#[\w-]+@)?[\w-]+@([\w-]+@)?(rows|currentRow|selectedRows|summaryRow|selectionSummaryRow)(\.[\w.]+)?$`,
    htmlTypes: ['div', 'span'],
    validTypePrefixes: ['r-', 'el-', 'Render', 'spark-'],
    validAggregateTypes: ['sum', 'count', 'avg', 'min', 'max', 'join'],
    nonFieldRTypes: ['r-table', 'r-form'],
    containerContextMap: { 'r-table': 'table', 'r-form': 'form' },
    nestingRules: {},
    ...overrides,
  }
}

function makeEntry(overrides?: Partial<ComponentEntry>): ComponentEntry {
  return {
    type: 'r-text',
    category: 'field',
    description: '文本字段',
    props: [
      { name: 'field', type: 'string', required: false, description: '绑定字段名' },
    ],
    emits: [],
    source: 'vcm',
    ...overrides,
  }
}

function makeCatalog(overrides?: Partial<ComponentCatalog>): ComponentCatalog {
  const components: Record<string, ComponentEntry> = {
    'r-table': makeEntry({
      type: 'r-table',
      category: 'container',
      description: '表格容器',
      props: [
        { name: 'dataKey', type: 'string', required: false, description: '表格数据源' },
        { name: 'border', type: 'boolean', required: false, description: '是否显示边框' },
      ],
    }),
    'r-text': makeEntry(),
  }

  return {
    version: '2.0.0',
    buildTime: '2026-04-06T00:00:00.000Z',
    componentCount: Object.keys(components).length,
    registry: {
      containers: ['r-table'],
      fields: ['r-text'],
      groups: [],
      meta: [],
    },
    sharedTypes: {},
    components,
    constraints: makeConstraints(),
    bindingDescriptors: {},
    ...overrides,
  }
}

describe('catalog-projections', () => {
  it('projectFcDirectory returns directory summary for session.describe', () => {
    const catalog = makeCatalog()
    const directory = projectFcDirectory(catalog)

    expect(directory.summary.total).toBe(2)
    expect(directory.summary.containers).toBe(1)
    expect(directory.summary.fields).toBe(1)
    expect(directory.components).toContainEqual({
      type: 'r-table',
      category: 'container',
      description: '表格容器',
    })
    expect(directory.registry.containers).toEqual(['r-table'])
  })

  it('projectFcSpec returns component spec for stills.actionSpec', () => {
    const catalog = makeCatalog()
    const spec = projectFcSpec(catalog, 'r-table')

    expect(spec).not.toBeNull()
    expect(spec!.type).toBe('r-table')
    expect(spec!.category).toBe('container')
    expect(spec!.props[0]?.name).toBe('dataKey')
    expect(spec!.props[1]?.name).toBe('border')
  })

  it('projectFcSpec returns null for unknown type', () => {
    expect(projectFcSpec(makeCatalog(), 'missing')).toBeNull()
  })

  it('projectDevTypes returns sorted type list', () => {
    const types = projectDevTypes(makeCatalog())
    expect(types).toContain('r-table')
    expect(types).toContain('r-text')
    expect(types).toEqual([...types].sort())
  })

  it('projectDevPropNames returns prop name lists per type', () => {
    const propNames = projectDevPropNames(makeCatalog())
    expect(propNames['r-table']).toContain('dataKey')
    expect(propNames['r-table']).toContain('border')
  })

  it('projectDevPropEnums parses enum values from type strings', () => {
    const catalog = makeCatalog({
      components: {
        'r-text': makeEntry({
          props: [
            { name: 'size', type: '"small" | "default" | "large"', required: false },
          ],
        }),
      },
    })
    const enums = projectDevPropEnums(catalog)
    expect(enums['r-text']?.['size']).toEqual(['small', 'default', 'large'])
  })
})