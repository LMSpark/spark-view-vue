import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { compileRule, parsePageData } from '@spark-view/spark-page-config'
import { SparkData } from '@spark-view/spark-data'
import { compileFunctions } from '../packages/spark-component/src/page/createSandbox'
import type { PageContext } from '../packages/spark-component/src/page/context/types'

const pageRoot = join(process.cwd(), 'spark-ai-server/data/pages-config/lmspark/homepage')

const pages = [
  {
    pageId: 'tx-editing-rows',
    functions: ['markDrafts', 'applyDrafts', 'discardDrafts', 'showEditingSummary'],
  },
  {
    pageId: 'tx-transaction-commit',
    functions: ['prepareTransactionTables', 'seedTransactionData', 'commitTransactionUpdate', 'reloadTransactionViews'],
  },
  {
    pageId: 'tx-transaction-retry',
    functions: ['prepareRetryTable', 'runReplayTwice', 'runRequestIdConflict', 'reloadAuditView'],
  },
] as const

function readPageFile(pageId: string, fileName: string): string {
  return readFileSync(join(pageRoot, pageId, fileName), 'utf8')
}

function createMockContext(): PageContext {
  return {
    $route: { path: '/', fullPath: '/', params: {}, query: {}, name: '', hash: '' },
    $el: () => null,
    $query: () => null,
    $queryAll: () => [] as unknown as NodeListOf<Element>,
    $dataSet: null,
    $components: {
      get: vi.fn(() => null),
      list: vi.fn(() => []),
      getApi: vi.fn(() => null),
      getApisByType: vi.fn(() => []),
    },
    $refreshData: vi.fn(async () => {}),
    $page: {
      showDialog: vi.fn(async () => 'confirm' as const),
      selectEntities: vi.fn(async () => []),
      browseFiles: vi.fn(async () => []),
      uploadFiles: vi.fn(async () => []),
      showMessage: vi.fn(),
      showConfirm: vi.fn(async () => true),
      showPrompt: vi.fn(async () => null),
      showAlert: vi.fn(async () => {}),
      showLoading: vi.fn(),
      navigate: vi.fn(),
    },
    permission: {} as PageContext['permission'],
    SparkData,
    h: vi.fn() as unknown as PageContext['h'],
    setTimeout: vi.fn() as unknown as PageContext['setTimeout'],
    clearTimeout: vi.fn() as unknown as PageContext['clearTimeout'],
    setInterval: vi.fn() as unknown as PageContext['setInterval'],
    clearInterval: vi.fn() as unknown as PageContext['clearInterval'],
    console,
    $moduleContext: null,
  }
}

describe('transaction validation page configs', () => {
  for (const page of pages) {
    it(`${page.pageId} parses page data, compiles rule tree, and exposes expected script functions`, () => {
      const pageDataText = readPageFile(page.pageId, 'pagedata.json')
      const ruleText = readPageFile(page.pageId, 'rule.json')
      const script = readPageFile(page.pageId, 'script.js')

      const parsedData = parsePageData(pageDataText)
      const compiledRule = compileRule(ruleText)
      const functions = compileFunctions(script, createMockContext())

      expect(parsedData.dataSetName).toBeTruthy()
      expect(compiledRule.length).toBeGreaterThan(0)
      for (const functionName of page.functions) {
        expect(functions[functionName]).toEqual(expect.any(Function))
      }
      expect(script).not.toMatch(/\b(?:window|document|fetch)\s*\./)
    })
  }

  it('backend transaction pages use the scoped synchronous transaction endpoint', () => {
    const commitScript = readPageFile('tx-transaction-commit', 'script.js')
    const retryScript = readPageFile('tx-transaction-retry', 'script.js')

    expect(commitScript).toContain("'/api/tenants/lmspark/projects/homepage'")
    expect(retryScript).toContain("'/api/tenants/lmspark/projects/homepage'")
    expect(commitScript).toContain("'/data/transactions'")
    expect(retryScript).toContain("'/data/transactions'")
    expect(commitScript).not.toContain('/data/batch-jobs')
    expect(retryScript).not.toContain('/data/batch-jobs')
  })
})
