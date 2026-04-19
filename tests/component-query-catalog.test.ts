import { describe, expect, it } from 'vitest'

import type {
  ComponentCatalog,
  ComponentEntry,
  PlatformConstraints,
} from '../packages/vite-plugin-spark-catalog/src/index'
import {
  projectFcDirectory,
  projectFcConfigGuide,
  projectFcSpec,
  projectDevTypes,
  projectDevPropNames,
  projectDevPropEnums,
  projectDevRequiredProps,
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
      rootFields: [
        {
          name: 'currentRow',
          type: 'object',
          description: '当前行',
          children: [
            {
              name: 'id',
              type: 'number',
              description: '主键',
            },
          ],
        },
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
    canonical: {
      dictionaries: {
        props: {
          prop_1: {
            name: 'rowKey',
            type: 'string | undefined',
            required: false,
            description: '行唯一键',
          },
          prop_2: {
            name: 'density',
            type: '"default" | "compact"',
            required: true,
            description: '密度',
          },
        },
        emits: {
          emit_1: {
            name: 'rowChange',
            type: '[row: Record<string, unknown>] ',
            description: '当前行变更事件',
          },
        },
      },
      components: {
        'r-table': {
          type: 'r-table',
          category: 'container',
          description: '表格容器',
          propRefs: ['prop_1', 'prop_2'],
          emitRefs: ['emit_1'],
          source: 'vcm',
        },
      },
    },
    components,
    constraints: makeConstraints(),
    bindingDescriptors: {
      'r-table': {
        dataContainer: true,
      },
    },
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
    expect(directory.capabilities).toBeDefined()
    expect(directory.capabilities.eventDriven).toContain('r-table')
    expect(directory.capabilities.dataBinding).toContain('r-table')
    expect(Array.isArray(directory.configurationPrinciples)).toBe(true)
    expect(directory.configurationPrinciples.length).toBeGreaterThan(0)
  })

  it('projectFcSpec returns component spec for stills.actionSpec', () => {
    const catalog = makeCatalog()
    const spec = projectFcSpec(catalog, 'r-table')

    expect(spec).not.toBeNull()
    expect(spec!.type).toBe('r-table')
    expect(spec!.category).toBe('container')
    expect(spec!.props.some((prop) => prop.name === 'dataKey')).toBe(true)
    expect(spec!.props.some((prop) => prop.name === 'border')).toBe(true)
    expect(spec!.props.some((prop) => prop.name === 'rowKey')).toBe(true)
    expect(spec!.emits.some((emit) => emit.name === 'rowChange')).toBe(true)
  })

  it('projectFcSpec returns null for unknown type', () => {
    expect(projectFcSpec(makeCatalog(), 'missing')).toBeNull()
  })

  it('projectFcConfigGuide returns normalized guide for known component', () => {
    const guide = projectFcConfigGuide(makeCatalog(), 'r-table')
    expect(guide).not.toBeNull()
    expect(guide?.type).toBe('r-table')
    expect(guide?.category).toBe('container')
    expect(guide?.minimalConfig.type).toBe('r-table')
    expect(Array.isArray(guide?.failFastChecks)).toBe(true)
    expect(guide?.rootFieldPaths).toContain('currentRow')
    expect(guide?.rootFieldPaths).toContain('currentRow.id')
  })

  it('projectFcConfigGuide returns null for unknown component', () => {
    expect(projectFcConfigGuide(makeCatalog(), 'missing')).toBeNull()
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
    expect(propNames['r-table']).toContain('density')
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

  it('projectDevPropEnums resolves enum values from schemaPool references', () => {
    const catalog = makeCatalog({
      schemaPool: {
        schema_00001: {
          kind: 'enum',
          type: 'EnumInputSchema',
          variants: ['input', 'textarea'],
        },
      },
      components: {
        'r-text': makeEntry({
          props: [
            { name: 'mode', type: 'string', required: false, schemaRef: 'schema_00001' },
          ],
        }),
      },
    })

    const enums = projectDevPropEnums(catalog)
    expect(enums['r-text']?.['mode']).toEqual(['input', 'textarea'])
  })

  it('projectDevRequiredProps includes required props merged from canonical refs', () => {
    const required = projectDevRequiredProps(makeCatalog())
    expect(required['r-table']).toBeDefined()
    expect(required['r-table']?.['density']).toBe('')
  })
})