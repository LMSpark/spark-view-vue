import { describe, expect, it, vi } from 'vitest'
import { SparkData } from '../spark-data'
import { CrudService } from '../crud-service'

describe('database CrudApi helper', () => {
  it('creates standard metadata-driven CRUD and tree endpoints', () => {
    const api = SparkData.createDatabaseCrudApi('Orders')

    expect(api.list).toEqual({ url: '/data/Orders/query', method: 'POST' })
    expect(api.create).toEqual({ url: '/data/Orders/records', method: 'POST' })
    expect(api.retrieve).toEqual({ url: '/data/Orders/records/get', method: 'POST' })
    expect(api.update).toEqual({ url: '/data/Orders/records/update', method: 'POST' })
    expect(api.delete).toEqual({ url: '/data/Orders/records/delete', method: 'POST' })
    expect(api.batch?.create).toEqual({ url: '/data/Orders/records/batch-create', method: 'POST' })
    expect(api.children).toEqual({ url: '/data/Orders/tree/children', method: 'POST' })
    expect(api.nestedSearch).toEqual({ url: '/data/Orders/tree/nested/search', method: 'POST' })
  })

  it('lets retrieve use POST for database metadata endpoints', async () => {
    const api = SparkData.createDatabaseCrudApi('Orders')
    const mockClient = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ id: 1, name: 'Order 1' }),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      request: vi.fn(),
      requestFull: vi.fn(),
    }
    const service = new CrudService(api, mockClient as any, () => ({ tenantId: 't1', projectId: 'p1' }))

    const result = await service.retrieve({ id: 1 })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ id: 1, name: 'Order 1' })
    expect(mockClient.post).toHaveBeenCalledWith('/tenants/t1/projects/p1/data/Orders/records/get', { id: 1 }, expect.any(Object))
    expect(mockClient.get).not.toHaveBeenCalled()
  })
})
