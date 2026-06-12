import { describe, expect, it } from 'vitest'
import { buildApplyStatements, buildCleanupScopeSubquery } from '../../scripts/migrate-pages-config-cleanup.mjs'

describe('migrate-pages-config-cleanup', () => {
  it('builds cleanup SQL for deleted page scope', () => {
    const entries = [
      { tenantId: 'lmspark', projectId: 'homepage', pageId: '123' },
      { tenantId: 'lmspark', projectId: 'engineering-pm', pageId: 'task-board' },
    ]

    const scope = buildCleanupScopeSubquery(entries)
    expect(scope).toContain("'123'")
    expect(scope).toContain("'task-board'")

    const statements = buildApplyStatements(entries)
    expect(statements).toHaveLength(4)
    expect(statements[0]).toContain('DELETE nav FROM NAVIGATION_NODE_FLAT nav')
    expect(statements[2]).toContain('DELETE fv FROM file_version fv')
    expect(statements[3]).toContain('DELETE pcf FROM page_config_file pcf')
  })
})
