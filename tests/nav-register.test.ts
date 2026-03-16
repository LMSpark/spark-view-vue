import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  registerPageNavigation,
  configureNavRegister,
} from '@spark-view/spark-ai'

// ─── Mock createRequest ──────────────────────────────────────────────────────

// vi.hoisted 确保 mockPost 在 vi.mock 工厂之前初始化
const { mockPost } = vi.hoisted(() => ({
  mockPost: vi.fn(),
}))

vi.mock('@spark-view/spark-utils', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@spark-view/spark-utils')
  return {
    ...actual,
    createRequest: () => ({
      post: mockPost,
      get: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    }),
  }
})

describe('nav-register', () => {
  beforeEach(() => {
    mockPost.mockReset()
    configureNavRegister({ getNavApiUrl: () => '/api/test/navigation' })
  })

  it('registers a new page node successfully', async () => {
    mockPost.mockResolvedValue({ success: true, node: { id: 'order-list' } })

    const result = await registerPageNavigation('order-list', {
      title: '订单列表',
      prompt: '创建一个订单列表页面',
    })

    expect(result.success).toBe(true)
    expect(result.alreadyExists).toBe(false)
    expect(result.error).toBeUndefined()

    // 验证 POST 参数
    expect(mockPost).toHaveBeenCalledOnce()
    const [url, body] = mockPost.mock.calls[0] as [string, Record<string, unknown>]
    expect(url).toBe('/api/test/navigation/nodes')
    expect(body).toHaveProperty('node')
    expect(body).toHaveProperty('parentId', null)

    const node = body['node'] as Record<string, unknown>
    expect(node['id']).toBe('order-list')
    expect(node['title']).toBe('订单列表')
    expect(node['type']).toBe('item')
    expect(node['nodeKind']).toBe('page')
    expect(node['path']).toBe('/order-list')
    expect(node['pageType']).toBe('config')
    expect(node['description']).toBe('创建一个订单列表页面')
  })

  it('detects duplicate node gracefully (alreadyExists)', async () => {
    // 后端返回 400 + { error: "节点 id 已存在: order-list" }
    const error = Object.assign(new Error('HTTP 400: Bad Request'), {
      name: 'RequestError',
      status: 400,
      response: { error: '节点 id 已存在: order-list' },
    })
    mockPost.mockRejectedValue(error)

    const result = await registerPageNavigation('order-list')

    expect(result.success).toBe(true)
    expect(result.alreadyExists).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('returns failure with error message on network error', async () => {
    mockPost.mockRejectedValue(new Error('Network timeout'))

    const result = await registerPageNavigation('new-page')

    expect(result.success).toBe(false)
    expect(result.alreadyExists).toBe(false)
    expect(result.error).toBe('Network timeout')
  })

  it('formats pageId to title when no title provided', async () => {
    mockPost.mockResolvedValue({ success: true })

    await registerPageNavigation('user-management')

    const [, body] = mockPost.mock.calls[0] as [string, Record<string, unknown>]
    const node = body['node'] as Record<string, unknown>
    expect(node['title']).toBe('User Management')
  })

  it('truncates long prompts for description', async () => {
    mockPost.mockResolvedValue({ success: true })
    const longPrompt = '这是一段超过六十个字符的描述文本。' + '补充更多内容以确保超过截断阈值。再多加点冗余文本来测试。'

    await registerPageNavigation('test-page', {
      prompt: longPrompt,
    })

    const [, body] = mockPost.mock.calls[0] as [string, Record<string, unknown>]
    const node = body['node'] as Record<string, unknown>
    // description 应截断至 60 字符
    expect(typeof node['description']).toBe('string')
    expect((node['description'] as string).length).toBeLessThanOrEqual(60)
  })
})
