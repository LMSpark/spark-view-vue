import { describe, it, expect } from 'vitest'
import { INSTANCE_PERMISSION_FIELD, MODEL_PERMISSION_FIELD } from '@spark-view/spark-data'
import { CrudService } from '../crud-service'

describe('CrudService - Permission Data Sanitization', () => {
  it('should sanitize permission fields from data before upload', () => {
    const service = new CrudService({
      create: { url: '/api/test', method: 'POST' },
      update: { url: '/api/test', method: 'PUT' },
      list: { url: '/api/test', method: 'GET' }
    })

    // Test data with permission fields
    const testData = {
      name: 'Test Item',
      value: 123,
      [INSTANCE_PERMISSION_FIELD]: {
        allowDelete: true,
        permissionToken: 'instance-token'
      },
      [MODEL_PERMISSION_FIELD]: {
        allowCreate: true,
        permissionToken: 'model-token'
      }
    }

    // Call the private method using type assertion
    const sanitized = (service as any).sanitizeDataForUpload(testData)

    // Verify permission fields are removed
    expect(sanitized).not.toHaveProperty(INSTANCE_PERMISSION_FIELD)
    expect(sanitized).not.toHaveProperty(MODEL_PERMISSION_FIELD)

    // Verify other fields are preserved
    expect(sanitized.name).toBe('Test Item')
    expect(sanitized.value).toBe(123)
  })

  it('should handle data without permission fields', () => {
    const service = new CrudService({
      create: { url: '/api/test', method: 'POST' }
    })

    const testData = {
      name: 'Clean Item',
      value: 456
    }

    const sanitized = (service as any).sanitizeDataForUpload(testData)

    expect(sanitized.name).toBe('Clean Item')
    expect(sanitized.value).toBe(456)
    expect(sanitized).not.toHaveProperty(INSTANCE_PERMISSION_FIELD)
    expect(sanitized).not.toHaveProperty(MODEL_PERMISSION_FIELD)
  })
})