/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-surface-types
 * 职责：维护 DTS ClassModel 知识链路中的 dts-surface-types 能力，围绕 DtsClassModelSurfaceDocument、ProjectDtsClassModelSurfaceOptions 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 ClassModel 在 class-model/class-model/dts-surface-types 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { ClassModel } from './types'
import type { ClassModelEmitSource } from './class-model-emit-path'

export const DTS_CLASS_MODEL_SURFACE_VERSION = 1 as const

/** Dts Class Model Surface Document 的语义模型。 */
export type DtsClassModelSurfaceDocument = Readonly<{
  schemaVersion: typeof DTS_CLASS_MODEL_SURFACE_VERSION
  source: ClassModelEmitSource
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
