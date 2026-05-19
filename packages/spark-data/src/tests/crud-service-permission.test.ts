import { describe, it, expect } from 'vitest'
import { INSTANCE_PERMISSION_FIELD, MODEL_PERMISSION_FIELD } from '@spark-view/spark-data'
import { CrudService } from '../crud-service'
import { getMember, requireRecord } from './test-type-helpers'

type SanitizeDataForUpload = (data: Record<string, unknown>) => unknown

function isSanitizeDataForUpload(value: unknown): value is SanitizeDataForUpload {
  return typeof value === 'function'
}

function sanitizeDataForUpload(service: CrudService, data: Record<string, unknown>): Record<string, unknown> {
  const member = getMember(service, 'sanitizeDataForUpload')
  if (!isSanitizeDataForUpload(member)) {
    throw new Error('Expected sanitizeDataForUpload method')
  }
  return requireRecord(member(data), 'Expected sanitized data to be an object')
}

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

    const sanitized = sanitizeDataForUpload(service, testData)

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

    const sanitized = sanitizeDataForUpload(service, testData)

    expect(sanitized.name).toBe('Clean Item')
    expect(sanitized.value).toBe(456)
    expect(sanitized).not.toHaveProperty(INSTANCE_PERMISSION_FIELD)
    expect(sanitized).not.toHaveProperty(MODEL_PERMISSION_FIELD)
  })
})
