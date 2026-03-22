/**
 * API Diff Report — 单元测试
 */

import { describe, it, expect } from 'vitest'
import { generateDiffReport, formatDiffReport } from '../packages/vite-plugin-spark-catalog/src/index'
import type { ExtractedComponentApi } from '../packages/vite-plugin-spark-catalog/src/index'

function makeApi(
  type: string,
  props: string[],
  emits: string[] = [],
  consumes: string[] = [],
  provides: string[] = [],
): ExtractedComponentApi {
  return {
    type,
    props: props.map(name => ({ name })),
    emits: emits.map(name => ({ name })),
    capabilities: { consumes, provides },
  }
}

describe('generateDiffReport', () => {
  it('reports fully documented component', () => {
    const apis = [makeApi('r-text', ['field', 'label', 'width'])]
    const catalog = { 'r-text': 'field: string — 字段\nlabel: string — 标签\nwidth: number — 宽度' }

    const report = generateDiffReport(apis, catalog)
    const comp = report.components.find(c => c.type === 'r-text')!

    expect(comp.propsCoverage).toBe(1)
    expect(comp.documentedProps).toEqual(['field', 'label', 'width'])
    expect(comp.undocumentedProps).toHaveLength(0)
  })

  it('reports undocumented props', () => {
    const apis = [makeApi('r-select', ['field', 'label', 'placeholder', 'clearable'])]
    const catalog = { 'r-select': 'field: string\nlabel: string' }

    const report = generateDiffReport(apis, catalog)
    const comp = report.components.find(c => c.type === 'r-select')!

    expect(comp.undocumentedProps).toContain('placeholder')
    expect(comp.undocumentedProps).toContain('clearable')
    expect(comp.propsCoverage).toBe(0.5) // 2/4
  })

  it('reports component without catalog entry', () => {
    const apis = [makeApi('r-new-comp', ['foo', 'bar'])]
    const catalog = {}

    const report = generateDiffReport(apis, catalog)
    const comp = report.components.find(c => c.type === 'r-new-comp')!

    expect(comp.hasExtractedApi).toBe(true)
    expect(comp.hasCatalogEntry).toBe(false)
    expect(comp.undocumentedProps).toEqual(['foo', 'bar'])
  })

  it('reports catalog-only entry (no extraction)', () => {
    const apis: ExtractedComponentApi[] = []
    const catalog = { 'legacy-comp': 'some: string — old docs' }

    const report = generateDiffReport(apis, catalog)
    const comp = report.components.find(c => c.type === 'legacy-comp')!

    expect(comp.hasExtractedApi).toBe(false)
    expect(comp.hasCatalogEntry).toBe(true)
  })

  it('reports undocumented emits', () => {
    const apis = [makeApi('r-text', ['field'], ['update:modelValue'])]
    const catalog = { 'r-text': 'field: string — 字段' }

    const report = generateDiffReport(apis, catalog)
    const comp = report.components.find(c => c.type === 'r-text')!

    expect(comp.undocumentedEmits).toContain('update:modelValue')
  })

  it('reports undocumented capabilities', () => {
    const apis = [makeApi('r-table', ['config'], [], ['PAGE_DATASET'], ['DATA_SOURCE'])]
    const catalog = { 'r-table': 'config: SparkNode' }

    const report = generateDiffReport(apis, catalog)
    const comp = report.components.find(c => c.type === 'r-table')!

    expect(comp.undocumentedConsumes).toContain('PAGE_DATASET')
    expect(comp.undocumentedProvides).toContain('DATA_SOURCE')
  })

  it('calculates summary statistics', () => {
    const apis = [
      makeApi('r-a', ['x', 'y']),
      makeApi('r-b', ['x', 'y']),
    ]
    const catalog = {
      'r-a': 'x: string\ny: string',    // 100%
      'r-b': 'x: string',                // 50%
    }

    const report = generateDiffReport(apis, catalog)

    expect(report.totalComponents).toBe(2)
    expect(report.componentsWithApi).toBe(2)
    expect(report.componentsWithDocs).toBe(2)
    expect(report.fullyDocumentedCount).toBe(1)
    expect(report.averagePropsCoverage).toBe(0.75) // (1 + 0.5) / 2
  })
})

describe('formatDiffReport', () => {
  it('produces human-readable output', () => {
    const apis = [
      makeApi('r-text', ['field', 'label', 'width']),
      makeApi('r-select', ['field', 'placeholder', 'clearable']),
    ]
    const catalog = {
      'r-text': 'field: string\nlabel: string\nwidth: number',
      'r-select': 'field: string',
    }

    const report = generateDiffReport(apis, catalog)
    const output = formatDiffReport(report)

    expect(output).toContain('Component API Coverage Report')
    expect(output).toContain('r-text')
    expect(output).toContain('r-select')
  })
})
