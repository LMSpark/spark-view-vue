import type { BaseContainerApi } from '../../support/base-container-api.js'

export interface RendererFormApi extends BaseContainerApi {
  getFormData(): Record<string, unknown>
    getNativeForm(): unknown
    validate(): Promise<boolean>
    resetFields(): void
    clearValidate(): void
    getFieldValue(field: string): unknown
    setFieldValue(field: string, value: unknown): void
}
