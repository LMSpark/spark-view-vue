/**
 * VCM dist bundle 协议：manifest + 按 kind 拆分的 metadata 文件。
 *
 * 构建期写入 generated/vcm/<target-id>/；Worker 按需 fetch kind 文件。
 */

import type { AiJsonSchemaObject } from '../../json'
import type { AiApiObjectMetadata, AiModuleMetadataJson } from './ai-api-object-metadata-schema'

export const VCM_BUNDLE_PROTOCOL = 'spark-appworks.vcm.bundle' as const
export const VCM_BUNDLE_JSON_SCHEMA = 'https://json-schema.org/draft/2020-12/schema' as const
export const VCM_KIND_PROTOCOL = 'spark-appworks.vcm.kind' as const
export const VCM_BUNDLE_SCHEMA_VERSION = 1 as const
export const VCM_KIND_SCHEMA_VERSION = 1 as const

/** manifest 中一条 attribute.api 导入边（BFS 索引，无需加载 kind 文件）。 */
export type VcmBundleAttributeApiEdge = Readonly<{
  from: string
  attribute: string
  to: string
}>

export type VcmBundleKindEntry = Readonly<{
  kind: string
  className: string
  /** 相对 manifest 的 kind 文件路径，例如 kinds/project.json */
  file: string
  /** 本 kind 文件直接引用的其它 kind（attribute.api / resultApis $ref）。 */
  importKinds: readonly string[]
}>

export type VcmBundleManifest = Readonly<{
  $schema: typeof VCM_BUNDLE_JSON_SCHEMA
  protocol: typeof VCM_BUNDLE_PROTOCOL
  schemaVersion: typeof VCM_BUNDLE_SCHEMA_VERSION
  targetId: string
  generatedBy: string
  note: string
  rootKind: string
  /** 相对 manifest 的共享 $defs 路径。 */
  defsFile: string
  kinds: Readonly<Record<string, VcmBundleKindEntry>>
  attributeApiEdges: readonly VcmBundleAttributeApiEdge[]
  /** 可选：与 monolithic runtime 对账用的组装后字节数。 */
  assembledModuleSchemaVersion?: 2
}>

export type VcmKindMetadataFile = Readonly<{
  protocol: typeof VCM_KIND_PROTOCOL
  schemaVersion: typeof VCM_KIND_SCHEMA_VERSION
  kind: string
  className: string
  api: AiApiObjectMetadata
}>

export type VcmBundleDefsFile = Readonly<{
  $schema: typeof VCM_BUNDLE_JSON_SCHEMA
  protocol: typeof VCM_BUNDLE_PROTOCOL
  schemaVersion: typeof VCM_BUNDLE_SCHEMA_VERSION
  $defs: Readonly<Record<string, AiJsonSchemaObject>>
}>

export type VcmBundleLoadedParts = Readonly<{
  manifest: VcmBundleManifest
  defs: Readonly<Record<string, AiJsonSchemaObject>>
  kinds: Readonly<Record<string, AiApiObjectMetadata>>
}>

export type AssembledRuntimeModule = Readonly<{
  module: AiModuleMetadataJson
  $defs: Readonly<Record<string, AiJsonSchemaObject>>
}>
