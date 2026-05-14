import { describe, expect, it } from 'vitest'

import type {
  ComponentCatalog,
  ComponentEntry,
  PlatformConstraints,
} from '../packages/vite-plugin-spark-catalog/src/index'
import {
  projectComponentDirectory,
  projectComponentConfigGuide,
  projectComponentSpec,
  projectFrameworkNeutralCatalog,
} from '../packages/spark-ai/src/registrations/page-design/payloads/catalog-projections'

function makeConstraints(overrides?: Partial<PlatformConstraints>): PlatformConstraints {
  return {
    dataKeyPattern: {
      value: String.raw`^(#[\w-]+@)?[\w-]+@([\w-]+@)?(rows|currentRow|selectedRows|aggregateResult|selectionAggregateResult)(\.[\w.]+)?$`,
      description: 'DataKey format constraint',
      examples: ['orders@rows'],
    },
    validTypePrefixes: {
      value: ['r-', 'spark-'],
      description: 'Valid component type prefixes',
      examples: ['r-table'],
    },
    validAggregateTypes: {
      value: ['sum', 'count', 'avg', 'min', 'max', 'join'],
      description: 'Valid aggregate operators',
      examples: ['sum'],
    },
    nonFieldRTypes: {
      value: ['r-table', 'r-form'],
      description: 'Container r-types that are not fields',
      examples: ['r-table'],
    },
    containerContextMap: {
      value: { 'r-table': 'table', 'r-form': 'form' },
      description: 'Container type to context mapping',
      examples: [{ type: 'r-table', context: 'table' }],
    },
    nestingRules: {
      value: {},
      description: 'Container child nesting rules',
      examples: [],
    },
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
        { name: 'rowKey', type: 'string | undefined', required: false, description: '行唯一键' },
        { name: 'density', type: '"default" | "compact"', required: true, description: '密度' },
      ],
      emits: [
        {
          name: 'rowChange',
          type: '[row: Record<string, unknown>] ',
          description: '当前行变更事件',
        },
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
    version: '4.0.0',
    buildTime: '2026-04-06T00:00:00.000Z',
    componentCount: Object.keys(components).length,
    sharedTypes: {},
    components,
    constraints: makeConstraints(),
    bindingDescriptors: {
      'r-table': {
        dataContainer: true,
        description: 'r-table data container binding',
        examples: [{ type: 'r-table', props: { dataKey: 'orders@rows' } }],
      },
    },
    ...overrides,
  }
}

describe('catalog-projections', () => {
  it('projectComponentDirectory returns component directory summary', () => {
    const catalog = makeCatalog()
    const directory = projectComponentDirectory(catalog)

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

  it('framework-neutral catalog keeps described platform constraints', () => {
    const neutralCatalog = projectFrameworkNeutralCatalog(makeCatalog())

    expect(neutralCatalog.constraints?.dataKeyPattern.value).toContain('rows')
    expect(neutralCatalog.constraints?.dataKeyPattern.description).toBeTruthy()
    expect(neutralCatalog.constraints?.validTypePrefixes.examples).toContain('r-table')
    expect(neutralCatalog.constraints?.nestingRules.value).toEqual({})
    expect(neutralCatalog.bindingDescriptors?.['r-table']?.description).toContain('data container')
    expect(neutralCatalog.bindingDescriptors?.['r-table']?.examples?.[0]).toEqual({
      type: 'r-table',
      props: { dataKey: 'orders@rows' },
    })
  })

  it('projectComponentSpec returns component spec for pageDesign/knowledge/guidePayload', () => {
    const catalog = makeCatalog()
    const spec = projectComponentSpec(catalog, 'r-table')

    expect(spec).not.toBeNull()
    expect(spec!.type).toBe('r-table')
    expect(spec!.category).toBe('container')
    expect(spec!.props.some((prop) => prop.name === 'dataKey')).toBe(true)
    expect(spec!.props.some((prop) => prop.name === 'border')).toBe(true)
    expect(spec!.props.some((prop) => prop.name === 'rowKey')).toBe(true)
    expect(spec!.emits.some((emit) => emit.name === 'rowChange')).toBe(true)
  })

  it('projectComponentSpec returns null for unknown type', () => {
    expect(projectComponentSpec(makeCatalog(), 'missing')).toBeNull()
  })

  it('filters non-configurable internal components from LLM-facing projections', () => {
    const catalog = makeCatalog({
      components: {
        'r-table': makeEntry({
          type: 'r-table',
          category: 'container',
          description: '表格容器',
          props: [{ name: 'dataKey', type: 'string', required: false }],
        }),
        'internal-panel': makeEntry({
          type: 'internal-panel',
          category: 'feature',
          description: '内部面板',
          internal: true,
          configurable: false,
        }),
      },
    })

    const directory = projectComponentDirectory(catalog)
    const neutralCatalog = projectFrameworkNeutralCatalog(catalog)

    expect(directory.components.map(entry => entry.type)).toEqual(['r-table'])
    expect(projectComponentSpec(catalog, 'internal-panel')).toBeNull()
    expect(projectComponentConfigGuide(catalog, 'internal-panel')).toBeNull()
    expect(neutralCatalog.components['internal-panel']).toBeUndefined()
  })

  it('projectComponentConfigGuide returns normalized guide for known component', () => {
    const guide = projectComponentConfigGuide(makeCatalog(), 'r-table')
    expect(guide).not.toBeNull()
    expect(guide?.type).toBe('r-table')
    expect(guide?.category).toBe('container')
    expect(guide?.minimalConfig.type).toBe('r-table')
    expect(Array.isArray(guide?.failFastChecks)).toBe(true)
    expect(guide?.rootFieldPaths).toContain('currentRow')
    expect(guide?.rootFieldPaths).toContain('currentRow.id')
  })

  it('component config projections exclude SparkNode structural props', () => {
    const catalog = makeCatalog({
      components: {
        'r-text': makeEntry({
          props: [
            { name: 'id', type: 'string', required: true },
            { name: 'type', type: 'string', required: false },
            { name: 'children', type: 'SparkNode[]', required: false },
            { name: 'field', type: 'string', required: true },
          ],
        }),
      },
    })

    const spec = projectComponentSpec(catalog, 'r-text')
    const guide = projectComponentConfigGuide(catalog, 'r-text')

    expect(spec?.props.map(prop => prop.name)).toEqual(['field'])
    expect(guide?.requiredProps.map(prop => prop.name)).toEqual(['field'])
    expect(guide?.optionalProps.map(prop => prop.name)).toEqual([])
    expect(guide?.minimalConfig).toEqual({
      type: 'r-text',
      props: { field: '<required>' },
    })
  })

  it('component config projections expose framework-neutral value instead of Vue modelValue', () => {
    const catalog = makeCatalog({
      components: {
        'r-text': makeEntry({
          props: [
            { name: 'field', type: 'string', required: true },
            { name: 'modelValue', type: 'string', required: false, description: 'Vue modelValue' },
          ],
          emits: [
            { name: 'update:modelValue', description: 'Vue model update' },
            { name: 'change', description: '业务变更' },
          ],
        }),
      },
    })

    const spec = projectComponentSpec(catalog, 'r-text')
    const guide = projectComponentConfigGuide(catalog, 'r-text')
    const neutralCatalog = projectFrameworkNeutralCatalog(catalog)
    const neutralEntry = neutralCatalog.components['r-text']

    expect(spec?.props.map(prop => prop.name)).toContain('value')
    expect(spec?.props.map(prop => prop.name)).not.toContain('modelValue')
    expect(spec?.emits.map(emit => emit.name)).toEqual(['change'])
    expect(guide?.optionalProps.map(prop => prop.name)).toContain('value')
    expect(neutralEntry?.props.map(prop => prop.name)).toContain('value')
    expect(neutralEntry?.emits?.map(emit => emit.name) ?? []).toEqual(['change'])
    expect('canonical' in neutralCatalog).toBe(false)
  })

  it('projectComponentConfigGuide returns null for unknown component', () => {
    expect(projectComponentConfigGuide(makeCatalog(), 'missing')).toBeNull()
  })
})
