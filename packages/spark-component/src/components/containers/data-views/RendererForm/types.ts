/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererForm/types
 * RendererForm 模块，属于 SPARK component table-level/data-view-container。
 * 组件目录: containers/data-views。
 * 导出 ClassModel symbol: RendererFormApi（共 1 个 symbol）。
 */
import type { BaseContainerApi } from '../../support/base-container-api.js'

/** Renderer Form Api 的语义模型。 */
export type RendererFormApi = BaseContainerApi & {
  getFormData(): Record<string, unknown>
    getNativeForm(): unknown
    validate(): Promise<boolean>
    resetFields(): void
    clearValidate(): void
    getFieldValue(field: string): unknown
    setFieldValue(field: string, value: unknown): void}
