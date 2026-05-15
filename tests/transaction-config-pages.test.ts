import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { compileRule, parsePageData } from '@spark-view/spark-page-config'
import type { HttpClient } from '@spark-view/spark-utils'

const pageRoot = join(process.cwd(), 'spark-ai-server/data/pages-config/lmspark/homepage')

const pages = ['tx-editing-rows', 'tx-transaction-commit', 'tx-transaction-retry'] as const

interface RuleNodeLike {
  props?: Record<string, unknown>
  children?: unknown[]
}

interface CapturedPost {
  url: string
  data: unknown
}

function readPageFile(pageId: string, fileName: string): string {
  return readFileSync(join(pageRoot, pageId, fileName), 'utf8')
}

function collectActions(nodes: unknown[]): string[] {
  const actions: string[] = []
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return
    const current = node as RuleNodeLike
    const action = current.props?.['action']
    if (typeof action === 'string') actions.push(action)
    for (const child of current.children ?? []) visit(child)
  }
  for (const node of nodes) visit(node)
  return actions
}

function readOperations(data: unknown): Array<Record<string, unknown>> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return []
  const operations = (data as { operations?: unknown }).operations
  if (!Array.isArray(operations)) return []
  return operations.filter((item): item is Record<string, unknown> => (
    item !== null && typeof item === 'object' && !Array.isArray(item)
  ))
}

function createMockHttpClient(posts: CapturedPost[]): HttpClient {
  const notUsed = vi.fn(async () => {
    throw new Error('unexpected HTTP method')
  })
  const post = vi.fn(async (url: string, data?: unknown) => {
    posts.push({ url, data })
    const operations = readOperations(data)
    return {
      success: true,
      transactionId: 'tx-test-1',
      operationCount: operations.length,
      results: operations.map((operation) => ({
        operationId: typeof operation['operationId'] === 'string' ? operation['operationId'] : undefined,
        status: 'success',
        result: operation['data'] ?? { deleted: true },
      })),
    }
  })

  return {
    interceptors: {
      request: { use: vi.fn(() => () => {}) },
      response: { use: vi.fn(() => () => {}) },
    },
    request: notUsed as HttpClient['request'],
    requestFull: notUsed as HttpClient['requestFull'],
    get: notUsed as HttpClient['get'],
    post: post as HttpClient['post'],
    put: notUsed as HttpClient['put'],
    patch: notUsed as HttpClient['patch'],
    delete: notUsed as HttpClient['delete'],
    clearCache: vi.fn(),
  }
}

describe('transaction validation page configs', () => {
  for (const pageId of pages) {
    it(`${pageId} is a zero-code transaction validation page`, () => {
      const pageDataText = readPageFile(pageId, 'pagedata.json')
      const ruleText = readPageFile(pageId, 'rule.json')

      const parsedData = parsePageData(pageDataText)
      const compiledRule = compileRule(ruleText)
      const actions = collectActions(compiledRule)

      expect(existsSync(join(pageRoot, pageId, 'script.js'))).toBe(false)
      expect(parsedData.toJson().saveChanges?.mode).toBe('transaction')
      expect(parsedData.toJson().saveChanges?.transaction?.endpoint.url).toBe('/data/transactions')
      expect(compiledRule.length).toBeGreaterThan(0)
      expect(actions).toContain('save-dataset')
      expect(ruleText).not.toContain('"click"')
      expect(ruleText).not.toContain('/data/batch-jobs')
    })
  }

  it('tx-transaction-commit sends parent before child operations through the configured transaction endpoint', async () => {
    const dataSet = parsePageData(readPageFile('tx-transaction-commit', 'pagedata.json'))
    dataSet.setPageRoute({ params: { tenantId: 'lmspark', projectId: 'homepage' } })
    const posts: CapturedPost[] = []
    dataSet.setSharedHttpClient(createMockHttpClient(posts))

    const orders = dataSet.getView('SparkTxOrders', 'default')
    const items = dataSet.getView('SparkTxItems', 'default')
    expect(orders).toBeDefined()
    expect(items).toBeDefined()

    await orders!.addRow({ id: 9001, orderNo: 'TX-BE-001', owner: 'Morgan', status: 'draft' })
    await items!.addRow({ id: 9101, orderId: 9001, sku: 'SKU-TX', quantity: 1, status: 'draft' })

    const result = await dataSet.saveChanges()
    expect(result.success).toBe(true)
    expect(posts).toHaveLength(1)
    expect(posts[0]!.url).toBe('/tenants/lmspark/projects/homepage/data/transactions')

    const operations = readOperations(posts[0]!.data)
    expect(operations.map((operation) => `${operation['tableName']}:${operation['op']}`)).toEqual([
      'SparkTxOrders:create',
      'SparkTxItems:create',
    ])
    expect(orders!.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(items!.dirtyTracking.hasPendingChanges()).toBe(false)
  })
})
