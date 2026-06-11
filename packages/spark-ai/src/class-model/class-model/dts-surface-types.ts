/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-surface-types
 * @spark-appworks/spark-ai 的 class-model/class-model/dts-surface-types 模块。
 * 导出 ClassModel symbol: DtsClassModelSurfaceDocument, ProjectDtsClassModelSurfaceOptions（共 2 个 symbol）。
 */
import type { ClassModel } from './types'

export const DTS_CLASS_MODEL_SURFACE_VERSION = 1 as const

/** Dts Class Model Surface Document 的语义模型。 */
export type DtsClassModelSurfaceDocument = Readonly<{
  schemaVersion: typeof DTS_CLASS_MODEL_SURFACE_VERSION
  source: 'declarations'
  configPath: string
  models: Readonly<Record<string, ClassModel>>
  fileIndex: Readonly<Record<string, readonly string[]>>
  generatedAt?: string
}>

/** Project Dts Class Model Surface Options 的调用配置。 */
export type ProjectDtsClassModelSurfaceOptions = Readonly<{
  configPath: string
  skipVueComponentDts?: boolean
  exportedOnly?: boolean
  failOnDuplicate?: boolean
}>
