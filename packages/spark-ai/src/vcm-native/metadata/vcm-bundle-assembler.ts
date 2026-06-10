/**
 * 将 manifest + kind 分片组装为 monolithic runtime module（测试 / 全量导入路径）。
 */

import type { AiApiObjectMetadata, AiModuleMetadataJson } from './ai-api-object-metadata-schema'
import type {
  AssembledRuntimeModule,
  VcmBundleLoadedParts,
  VcmBundleManifest,
  VcmKindMetadataFile,
} from './vcm-bundle-types'
import {
  VCM_BUNDLE_PROTOCOL,
  VCM_BUNDLE_SCHEMA_VERSION,
  VCM_KIND_PROTOCOL,
  VCM_KIND_SCHEMA_VERSION,
} from './vcm-bundle-types'
import type { ModuleMetadataRuntimeDocument } from './module-metadata-runtime-document'
import { MODULE_METADATA_RUNTIME_JSON_SCHEMA } from './module-metadata-runtime-document'

export function readVcmBundleManifest(value: unknown): VcmBundleManifest {
  return assertBundleManifest(value)
}

export function readVcmKindMetadataFile(value: unknown): VcmKindMetadataFile {
  if (!isRecord(value)) {
    throw new Error('VCM kind metadata file must be an object.')
  }
  if (value['protocol'] !== VCM_KIND_PROTOCOL) {
    throw new Error(`VCM kind metadata protocol must be "${VCM_KIND_PROTOCOL}".`)
  }
  if (value['schemaVersion'] !== VCM_KIND_SCHEMA_VERSION) {
    throw new Error(`VCM kind metadata schemaVersion must be ${String(VCM_KIND_SCHEMA_VERSION)}.`)
  }
  const kind = value['kind']
  const className = value['className']
  const api = value['api']
  if (typeof kind !== 'string' || kind.length === 0) {
    throw new Error('VCM kind metadata kind is required.')
  }
  if (typeof className !== 'string' || className.length === 0) {
    throw new Error('VCM kind metadata className is required.')
  }
  if (!isRecord(api)) {
    throw new Error('VCM kind metadata api must be an object.')
  }
  if (!isAiApiObjectMetadata(api)) {
    throw new Error('VCM kind metadata api must include kind/actions metadata.')
  }
  return {
    protocol: VCM_KIND_PROTOCOL,
    schemaVersion: VCM_KIND_SCHEMA_VERSION,
    kind,
    className,
    api,
  }
}

export function assembleRuntimeModuleFromBundle(parts: VcmBundleLoadedParts): AssembledRuntimeModule {
  const rootKind = parts.manifest.rootKind
  const rootApi = parts.kinds[rootKind]
  if (rootApi === undefined) {
    throw new Error(`VCM bundle is missing root kind "${rootKind}".`)
  }
  const apiRegistry: Record<string, AiApiObjectMetadata> = {}
  for (const [kind, api] of Object.entries(parts.kinds)) {
    if (kind === rootKind) continue
    apiRegistry[kind] = api
  }
  const module: AiModuleMetadataJson = {
    schemaVersion: 2,
    rootApi,
    apiRegistry,
  }
  return { module, $defs: parts.defs }
}

export function assembleRuntimeDocumentFromBundle(parts: VcmBundleLoadedParts): ModuleMetadataRuntimeDocument {
  const assembled = assembleRuntimeModuleFromBundle(parts)
  return {
    $schema: MODULE_METADATA_RUNTIME_JSON_SCHEMA,
    schemaVersion: 2,
    generatedBy: parts.manifest.generatedBy,
    note: parts.manifest.note,
    $defs: assembled.$defs,
    modules: [assembled.module],
  }
}

export function listManifestKindIds(manifest: VcmBundleManifest): readonly string[] {
  return Object.keys(manifest.kinds).sort()
}

/** 展开 manifest 声明的 importKinds（传递闭包），供按需 guide 组装 apiRegistry。 */
export function expandBundleKindsWithImportKinds(
  manifest: VcmBundleManifest,
  kinds: readonly string[],
): readonly string[] {
  const result = new Set(kinds)
  const queue = [...kinds]
  while (queue.length > 0) {
    const kind = queue.shift()
    if (kind === undefined) continue
    const entry = manifest.kinds[kind]
    if (entry === undefined) continue
    for (const imported of entry.importKinds) {
      if (!result.has(imported)) {
        result.add(imported)
        queue.push(imported)
      }
    }
  }
  return [...result]
}

export function listManifestAttributeReachableKinds(manifest: VcmBundleManifest): readonly string[] {
  const kinds: string[] = []
  const visited = new Set<string>()
  const queue = [manifest.rootKind]
  while (queue.length > 0) {
    const kind = queue.shift()
    if (kind === undefined || visited.has(kind)) continue
    visited.add(kind)
    kinds.push(kind)
    for (const edge of manifest.attributeApiEdges) {
      if (edge.from === kind && !visited.has(edge.to)) {
        queue.push(edge.to)
      }
    }
  }
  return kinds
}

function assertBundleManifest(value: unknown): VcmBundleManifest {
  if (!isRecord(value)) {
    throw new Error('VCM bundle manifest must be an object.')
  }
  if (value['protocol'] !== VCM_BUNDLE_PROTOCOL) {
    throw new Error(`VCM bundle protocol must be "${VCM_BUNDLE_PROTOCOL}".`)
  }
  if (value['schemaVersion'] !== VCM_BUNDLE_SCHEMA_VERSION) {
    throw new Error(`VCM bundle schemaVersion must be ${String(VCM_BUNDLE_SCHEMA_VERSION)}.`)
  }
  const targetId = value['targetId']
  const generatedBy = value['generatedBy']
  const note = value['note']
  const rootKind = value['rootKind']
  const defsFile = value['defsFile']
  if (typeof targetId !== 'string' || targetId.length === 0) {
    throw new Error('VCM bundle manifest targetId is required.')
  }
  if (typeof generatedBy !== 'string' || typeof note !== 'string') {
    throw new Error('VCM bundle manifest generatedBy/note must be strings.')
  }
  if (typeof rootKind !== 'string' || rootKind.length === 0) {
    throw new Error('VCM bundle manifest rootKind is required.')
  }
  if (typeof defsFile !== 'string' || defsFile.length === 0) {
    throw new Error('VCM bundle manifest defsFile is required.')
  }
  const kindsValue = value['kinds']
  if (!isRecord(kindsValue) || Object.keys(kindsValue).length === 0) {
    throw new Error('VCM bundle manifest kinds must be a non-empty object.')
  }
  const kinds: Record<string, VcmBundleManifest['kinds'][string]> = {}
  for (const [kind, entryValue] of Object.entries(kindsValue)) {
    if (!isRecord(entryValue)) {
      throw new Error(`VCM bundle manifest kinds["${kind}"] must be an object.`)
    }
    const file = entryValue['file']
    const className = entryValue['className']
    const importKinds = entryValue['importKinds']
    if (typeof file !== 'string' || file.length === 0) {
      throw new Error(`VCM bundle manifest kinds["${kind}"].file is required.`)
    }
    if (typeof className !== 'string' || className.length === 0) {
      throw new Error(`VCM bundle manifest kinds["${kind}"].className is required.`)
    }
    if (!Array.isArray(importKinds)) {
      throw new Error(`VCM bundle manifest kinds["${kind}"].importKinds must be an array.`)
    }
    kinds[kind] = {
      kind,
      className,
      file,
      importKinds: importKinds.filter((item): item is string => typeof item === 'string'),
    }
  }
  const edgesValue = value['attributeApiEdges']
  if (!Array.isArray(edgesValue)) {
    throw new Error('VCM bundle manifest attributeApiEdges must be an array.')
  }
  const attributeApiEdges = edgesValue.map((edge, index) => {
    if (!isRecord(edge)) {
      throw new Error(`VCM bundle manifest attributeApiEdges[${String(index)}] must be an object.`)
    }
    const from = edge['from']
    const attribute = edge['attribute']
    const to = edge['to']
    if (typeof from !== 'string' || typeof attribute !== 'string' || typeof to !== 'string') {
      throw new Error(`VCM bundle manifest attributeApiEdges[${String(index)}] requires from/attribute/to.`)
    }
    return { from, attribute, to }
  })
  return {
    $schema: MODULE_METADATA_RUNTIME_JSON_SCHEMA,
    protocol: VCM_BUNDLE_PROTOCOL,
    schemaVersion: VCM_BUNDLE_SCHEMA_VERSION,
    targetId,
    generatedBy,
    note,
    rootKind,
    defsFile,
    kinds,
    attributeApiEdges,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isAiApiObjectMetadata(value: Record<string, unknown>): value is AiApiObjectMetadata {
  const kind = value['kind']
  const actions = value['actions']
  return typeof kind === 'string'
    && kind.length > 0
    && Array.isArray(actions)
}
