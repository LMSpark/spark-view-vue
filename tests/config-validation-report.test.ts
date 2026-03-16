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
})
