import { describe, expect, it } from 'vitest'
import { validateGeneratedConfig } from '@spark-view/spark-ai'

describe('validateGeneratedConfig', () => {
  it('returns valid report for consistent files', () => {
    const report = validateGeneratedConfig({
      'rule.json': JSON.stringify([
        {
          type: 'r-table',
          dataKey: 'Users@rows',
          on: { rowClick: 'handleRowClick' },
          children: [
            { type: 'RenderToolbar' },
          ],
        },
      ]),
      'pagedata.json': JSON.stringify({
        dataSetName: 'DS',
        tables: {
          Users: { rows: [] },
        },
      }),
      'script.js': `
        function RenderToolbar() { return h('div', 'ok') }
        function handleRowClick() { return null }
      `,
    })

    expect(report.valid).toBe(true)
    expect(report.summary.errors).toBe(0)
    expect(report.summary.warnings).toBe(0)
    expect(report.issues).toHaveLength(0)
  })

  it('reports dataKey/handler/render/component issues', () => {
    const report = validateGeneratedConfig({
      'rule.json': JSON.stringify([
        {
          type: 'UnknownWidget',
          dataKey: 'Users.rows',
          on: { click: 'handleMissing' },
          children: [
            { type: 'RenderCard' },
          ],
        },
      ]),
      'pagedata.json': JSON.stringify({
        dataSetName: 'DS',
        tables: {
          Orders: { rows: [] },
        },
      }),
      'script.js': `function existing(){}`,
    })

    const categories = new Set(report.issues.map(item => item.category))

    expect(report.valid).toBe(false)
    expect(report.summary.errors).toBeGreaterThan(0)
    expect(categories.has('dataKey')).toBe(true)
    expect(categories.has('handler')).toBe(true)
    expect(categories.has('render')).toBe(true)
    expect(categories.has('component')).toBe(true)
  })

  it('skips local table existence check for cross-page scoped dataKey', () => {
    const report = validateGeneratedConfig({
      'rule.json': JSON.stringify([{ type: 'r-table', dataKey: '#SharedDS@Users@rows' }]),
      'pagedata.json': JSON.stringify({
        dataSetName: 'DS',
        tables: {
          Orders: { rows: [] },
        },
      }),
      'script.js': '',
    })

    const tableErrors = report.issues.filter(item =>
      item.category === 'dataKey' && item.message.includes('不存在'),
    )

    expect(tableErrors).toHaveLength(0)
  })

  it('treats r-column-group as non-field container (no missing-field warning)', () => {
    const report = validateGeneratedConfig({
      'rule.json': JSON.stringify([{
        type: 'r-table',
        dataKey: 'Users@rows',
        props: { highlightCurrentRow: true },
        children: [
          {
            type: 'r-column-group',
            props: { label: '基本信息' },
            children: [
              { type: 'r-text', field: 'name', props: { label: '姓名' } },
              { type: 'r-number', field: 'age', props: { label: '年龄' } },
            ],
          },
        ],
      }]),
      'pagedata.json': JSON.stringify({
        dataSetName: 'DS',
        tables: { Users: { rows: [] } },
      }),
      'script.js': '',
    })

    // r-column-group should NOT trigger "字段组件缺少父容器" warning
    const colGroupWarnings = report.issues.filter(i =>
      i.message.includes('r-column-group') && i.message.includes('缺少父容器'),
    )
    expect(colGroupWarnings).toHaveLength(0)
    expect(report.valid).toBe(true)
  })

  it('detects style/class on top-level instead of inside props', () => {
    const report = validateGeneratedConfig({
      'rule.json': JSON.stringify([{
        type: 'div',
        style: { color: 'red' },
        class: 'my-class',
        children: [],
      }]),
      'script.js': '',
    })

    const styleWarnings = report.issues.filter(i => i.message.includes('style 写在顶层'))
    const classWarnings = report.issues.filter(i => i.message.includes('class 写在顶层'))
    expect(styleWarnings).toHaveLength(1)
    expect(classWarnings).toHaveLength(1)
  })

  it('does not warn when style/class is inside props', () => {
    const report = validateGeneratedConfig({
      'rule.json': JSON.stringify([{
        type: 'div',
        style: { color: 'red' },
        props: { style: { color: 'red' }, class: 'ok' },
        class: 'also-top',
        children: [],
      }]),
      'script.js': '',
    })

    // Both style and class exist in props, so no warning
    const styleWarnings = report.issues.filter(i => i.message.includes('style 写在顶层'))
    const classWarnings = report.issues.filter(i => i.message.includes('class 写在顶层'))
    expect(styleWarnings).toHaveLength(0)
    expect(classWarnings).toHaveLength(0)
  })

  it('validates aggregates config - reports invalid aggregate type', () => {
    const report = validateGeneratedConfig({
      'rule.json': JSON.stringify([{ type: 'r-table', dataKey: 'Orders@rows' }]),
      'pagedata.json': JSON.stringify({
        dataSetName: 'DS',
        tables: {
          Orders: {
            rows: [],
            aggregates: {
              total: { type: 'sum' },
              name: { type: 'invalid-type' },
            },
          },
        },
      }),
      'script.js': '',
    })

    const aggIssues = report.issues.filter(i => i.message.includes('聚合'))
    expect(aggIssues).toHaveLength(1)
    expect(aggIssues[0]?.message).toContain('invalid-type')
  })

  it('validates aggregates config - accepts valid types', () => {
    const report = validateGeneratedConfig({
      'rule.json': JSON.stringify([{ type: 'r-table', dataKey: 'Orders@rows' }]),
      'pagedata.json': JSON.stringify({
        dataSetName: 'DS',
        tables: {
          Orders: {
            rows: [],
            aggregates: {
              total: { type: 'sum' },
              count: { type: 'count' },
              avg: { type: 'avg' },
              name: { type: 'join' },
            },
          },
        },
      }),
      'script.js': '',
    })

    const aggIssues = report.issues.filter(i => i.message.includes('聚合'))
    expect(aggIssues).toHaveLength(0)
  })
})
