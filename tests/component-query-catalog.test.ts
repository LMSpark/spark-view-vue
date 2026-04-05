import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  generateComponentDescribeCatalog,
  generateComponentQueryCatalog,
  generatePropsCatalog,
  queryComponentCatalog,
  queryComponentActionSpec,
  queryComponentPromptRecord,
} from '../packages/vite-plugin-spark-catalog/src/index'
import type {
  ComponentCatalog,
  ComponentEntry,
  PlatformConstraints,
} from '../packages/vite-plugin-spark-catalog/src/index'

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

describe('component query catalog', () => {
  it('builds describe-shaped directory/spec artifacts for session.describe and actionSpec-style lookup', () => {
    const catalog = makeCatalog()
    const describeCatalog = generateComponentDescribeCatalog(catalog)

    expect(describeCatalog.directory.summary.total).toBe(2)
    expect(describeCatalog.directory.summary.containers).toBe(1)
    expect(describeCatalog.directory.components).toContainEqual({
      type: 'r-table',
      category: 'container',
      description: '表格容器',
    })
    expect(describeCatalog.specByType['r-table']).toMatchObject({
      type: 'r-table',
      category: 'container',
      description: '表格容器',
    })
    expect(describeCatalog.specByType['r-table']?.props[0]?.name).toBe('dataKey')
    expect(queryComponentActionSpec(describeCatalog.specByType, 'r-table')?.props[1]?.name).toBe('border')
    expect(queryComponentActionSpec(describeCatalog.specByType, 'missing-widget')).toBeNull()
  })

  it('builds directory prompt and prompt-by-type as a first-class toolkit API', () => {
    const catalog = makeCatalog()
    const queryCatalog = generateComponentQueryCatalog(catalog)

    expect(queryCatalog.directoryPrompt).toContain('## 组件目录')
    expect(queryCatalog.directoryPrompt).toContain('## 组件索引')
    expect(queryCatalog.directoryPrompt).toContain('| r-table | container | 表格容器 |')
    expect(queryCatalog.promptByType['r-table']).toContain('**r-table**')
    expect(queryCatalog.promptByType['r-table']).toContain('dataKey?: string — 表格数据源')
  })

  it('queries component directory from the toolkit instead of generated files', () => {
    const catalog = makeCatalog()
    const queryCatalog = generateComponentQueryCatalog(catalog)

    const result = queryComponentPromptRecord(
      queryCatalog.promptByType,
      ['@list', 'r-table#dataKey', 'missing-widget'],
      queryCatalog.directoryPrompt,
    )

    expect(result).toContain('## 组件目录')
    expect(result).toContain('dataKey?: string — 表格数据源')
    expect(result).toContain('❌ 未找到组件「missing-widget」')
  })

  it('keeps queryComponentCatalog aligned with the query catalog artifact semantics', () => {
    const catalog = makeCatalog()

    const result = queryComponentCatalog(catalog, ['@list', 'r-text'])

    expect(result).toContain('## 组件目录')
    expect(result).toContain('**r-text** — 文本字段')
  })
})

describe('generatePropsCatalog', () => {
  it('writes AI query artifacts through the toolkit generator', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'spark-query-catalog-'))
    try {
      mkdirSync(join(tempRoot, 'packages', 'spark-ai', 'src', 'catalog'), { recursive: true })

      generatePropsCatalog(tempRoot, {}, makeCatalog())

      const output = readFileSync(
        join(tempRoot, 'packages', 'spark-ai', 'src', 'catalog', 'component-props-catalog.ts'),
        'utf-8',
      )

      expect(output).toContain('export const COMPONENT_DIRECTORY_DESCRIBE =')
      expect(output).toContain('export const COMPONENT_SPEC_BY_TYPE =')
      expect(output).toContain('export const COMPONENT_DIRECTORY_PROMPT =')
      expect(output).toContain('export const COMPONENT_PROMPT_BY_TYPE: Record<string, string> =')
      expect(output).toContain(".split('\\n')")
      expect(output).toContain("matched.join('\\n')")
      expect(output).toContain("results.join('\\n\\n---\\n\\n')")
      expect(output).toContain('表格容器')
      expect(output).toContain('文本字段')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})