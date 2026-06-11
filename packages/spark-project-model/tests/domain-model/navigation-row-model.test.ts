import { describe, expect, it } from 'vitest'
import {
  NavigationRowModel,
  PageConfigModel,
} from '../../src/index.js'

describe('NavigationRowModel', () => {
  it('round-trips flat row with optional pageConfig via toJson', () => {
    const row = new NavigationRowModel({
      id: 'page-home',
      parentId: '',
      projectId: 'demo',
      tenantId: 't1',
      title: 'Home',
      pageConfig: new PageConfigModel({
        pageId: 'page-home',
        ruleJson: '[]',
        script: 'console.log(1)',
      }),
    })

    expect(row.pageConfig?.script).toBe('console.log(1)')

    const json = row.toJson()
    expect(json).toMatchObject({
      id: 'page-home',
      parentId: '',
      title: 'Home',
      pageConfig: {
        pageId: 'page-home',
        ruleJson: '[]',
        script: 'console.log(1)',
      },
    })
  })
})
