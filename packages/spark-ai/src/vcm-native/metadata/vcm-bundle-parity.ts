import { join } from 'node:path'

import { compareClassModelDocumentsForBuildConsistency } from '../class-model/consistency'
import { createClassModelDocumentFromRuntimeDocument } from '../class-model/from-runtime-metadata'
import type { AiApiObjectMetadata } from './ai-api-object-metadata-schema'
import {
  assembleRuntimeDocumentFromBundle,
  readVcmBundleManifest,
  readVcmKindMetadataFile,
} from './vcm-bundle-assembler'
import { readModuleMetadataRuntimeDocument } from './module-metadata-runtime-document'
import type { VcmBundleLoadedParts } from './vcm-bundle-types'
import { VCM_BUNDLE_PROTOCOL, VCM_BUNDLE_SCHEMA_VERSION } from './vcm-bundle-types'

export type VcmBundleMonolithicParityIssue = Readonly<{
  code: string
  path: string
  message: string
}>

export function loadVcmBundlePartsFromDist(
  distDir: string,
  readJsonFile: (absolutePath: string) => unknown,
): VcmBundleLoadedParts {
  const manifest = readVcmBundleManifest(readJsonFile(join(distDir, 'manifest.json')))
  const defs = readBundleSchemaDefsFile(readJsonFile(join(distDir, '$defs.json')))
  const kinds: Record<string, AiApiObjectMetadata> = {}
  for (const entry of Object.values(manifest.kinds)) {
    const kindFile = readVcmKindMetadataFile(readJsonFile(join(distDir, entry.file)))
    kinds[kindFile.kind] = kindFile.api
  }
  return { manifest, defs, kinds }
}

/** bundle 分片组装结果 vs monolithic runtime 的 ClassModel 语义对账。 */
export function compareVcmBundleWithMonolithicRuntime(command: Readonly<{
  bundle: VcmBundleLoadedParts
  monolithic: unknown
}>): readonly VcmBundleMonolithicParityIssue[] {
  const assembled = assembleRuntimeDocumentFromBundle(command.bundle)
  const monolithicRuntime = readModuleMetadataRuntimeDocument(command.monolithic)
  const assembledDocument = createClassModelDocumentFromRuntimeDocument(assembled)
  const monolithicClassModel = createClassModelDocumentFromRuntimeDocument({
    modules: monolithicRuntime.modules,
    ...(monolithicRuntime.$defs === undefined ? {} : { $defs: monolithicRuntime.$defs }),
  })
  return compareClassModelDocumentsForBuildConsistency(
    assembledDocument,
    monolithicClassModel,
  ).map(issue => ({
    code: 'BUNDLE_MONOLITHIC_MISMATCH',
    path: issue.path,
    message: issue.message,
  }))
}

function readBundleSchemaDefsFile(
  raw: unknown,
): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  if (!isRecord(raw)) {
    throw new Error('VCM bundle $defs.json must be an object.')
  }
  if (raw['protocol'] !== VCM_BUNDLE_PROTOCOL) {
    throw new Error(`VCM bundle $defs protocol must be "${VCM_BUNDLE_PROTOCOL}".`)
  }
  if (raw['schemaVersion'] !== VCM_BUNDLE_SCHEMA_VERSION) {
    throw new Error(`VCM bundle $defs schemaVersion must be ${String(VCM_BUNDLE_SCHEMA_VERSION)}.`)
  }
  const defs = raw['$defs']
  if (!isRecord(defs)) {
    throw new Error('VCM bundle $defs.json must include $defs.')
  }
  const next: Record<string, Readonly<Record<string, unknown>>> = {}
  for (const [key, value] of Object.entries(defs)) {
    if (!isRecord(value)) {
      throw new Error(`VCM bundle $defs["${key}"] must be an object.`)
    }
    next[key] = value
  }
  return next
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
