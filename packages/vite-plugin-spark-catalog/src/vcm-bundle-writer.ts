/**
 * 将 compact runtime module 拆分为 dist 目录：manifest + $defs + kinds/*.json。
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import type {
  AiApiObjectMetadataCompact,
  AiModuleMetadataJsonCompact,
} from './module-api-registry-compact'

const VCM_BUNDLE_PROTOCOL = 'spark-appworks.vcm.bundle'
const VCM_KIND_PROTOCOL = 'spark-appworks.vcm.kind'
const VCM_BUNDLE_SCHEMA_VERSION = 1
const VCM_KIND_SCHEMA_VERSION = 1
const MODULE_METADATA_RUNTIME_JSON_SCHEMA = 'https://json-schema.org/draft/2020-12/schema'

type KindFileApi = Readonly<Record<string, unknown>>

type RuntimeDocumentLike = Readonly<{
  $schema?: string
  schemaVersion: number
  generatedBy: string
  note: string
  $defs?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  modules: readonly AiModuleMetadataJsonCompact[]
}>

export type VcmBundleWriteCommand = Readonly<{
  distDir: string
  targetId: string
  /** 与 module-metadata-generator 一致的 runtime document（含 pooled $defs）。 */
  runtimeDocument: RuntimeDocumentLike
  /** 组装后的 monolithic runtime 文件名，默认 bundle.runtime.generated.json */
  assembledRuntimeFileName?: string
}>

export type VcmBundleWriteResult = Readonly<{
  distDir: string
  manifestFile: string
  defsFile: string
  kindFiles: readonly string[]
  assembledRuntimeFile: string
}>

export function writeVcmBundleDist(command: VcmBundleWriteCommand): VcmBundleWriteResult {
  if (command.runtimeDocument.modules.length !== 1) {
    throw new Error('VCM bundle writer currently supports exactly one module metadata entry.')
  }
  const compact = command.runtimeDocument.modules[0]
  if (compact === undefined) {
    throw new Error('VCM bundle writer requires module metadata.')
  }
  const registry = compact.apiRegistry
  const allKinds = collectAllKinds(compact.rootApi, registry)

  mkdirSync(command.distDir, { recursive: true })
  const kindsDir = join(command.distDir, 'kinds')
  mkdirSync(kindsDir, { recursive: true })

  const kindFiles: string[] = []
  const manifestKinds: Record<string, {
    kind: string
    className: string
    file: string
    importKinds: string[]
  }> = {}

  for (const kind of allKinds) {
    const api = kind === compact.rootApi.kind ? compact.rootApi : registry[kind]
    if (api === undefined) continue
    const splitApi = splitApiForKindFile(api, registry)
    const importKinds = collectImportKinds(splitApi)
    const fileName = `${kind}.json`
    const relativeFile = posix.join('kinds', fileName)
    const absoluteFile = join(command.distDir, relativeFile)
    writeFileSync(absoluteFile, `${JSON.stringify({
      protocol: VCM_KIND_PROTOCOL,
      schemaVersion: VCM_KIND_SCHEMA_VERSION,
      kind,
      className: api.className,
      api: splitApi,
    })}\n`, 'utf8')
    kindFiles.push(relativeFile)
    manifestKinds[kind] = {
      kind,
      className: api.className,
      file: relativeFile,
      importKinds,
    }
  }

  const defsFile = '$defs.json'
  writeFileSync(join(command.distDir, defsFile), `${JSON.stringify({
    $schema: MODULE_METADATA_RUNTIME_JSON_SCHEMA,
    protocol: VCM_BUNDLE_PROTOCOL,
    schemaVersion: VCM_BUNDLE_SCHEMA_VERSION,
    $defs: command.runtimeDocument.$defs ?? {},
  })}\n`, 'utf8')

  const attributeApiEdges = collectAttributeApiEdges(compact.rootApi, registry)
  const manifestFile = 'manifest.json'
  const manifest = {
    $schema: MODULE_METADATA_RUNTIME_JSON_SCHEMA,
    protocol: VCM_BUNDLE_PROTOCOL,
    schemaVersion: VCM_BUNDLE_SCHEMA_VERSION,
    targetId: command.targetId,
    generatedBy: command.runtimeDocument.generatedBy,
    note: command.runtimeDocument.note,
    rootKind: compact.rootApi.kind,
    defsFile,
    kinds: manifestKinds,
    attributeApiEdges,
    assembledModuleSchemaVersion: 2,
  }
  writeFileSync(join(command.distDir, manifestFile), `${JSON.stringify(manifest)}\n`, 'utf8')

  const assembledRuntimeFile = command.assembledRuntimeFileName ?? 'bundle.runtime.generated.json'
  writeFileSync(join(command.distDir, assembledRuntimeFile), `${JSON.stringify(command.runtimeDocument)}\n`, 'utf8')

  return {
    distDir: command.distDir,
    manifestFile,
    defsFile,
    kindFiles,
    assembledRuntimeFile,
  }
}

function collectAllKinds(
  rootApi: AiApiObjectMetadataCompact,
  registry: Readonly<Record<string, AiApiObjectMetadataCompact>>,
): string[] {
  return [rootApi.kind, ...Object.keys(registry)].sort()
}

function splitApiForKindFile(
  api: AiApiObjectMetadataCompact,
  registry: Readonly<Record<string, AiApiObjectMetadataCompact>>,
): KindFileApi {
  return {
    ...api,
    ...(api.attributes === undefined
      ? {}
      : {
          attributes: api.attributes.map(attribute => ({
            ...attribute,
            ...(attribute.api === undefined
              ? {}
              : { api: splitAttributeApiRef(attribute.api, registry) }),
          })),
        }),
    actions: api.actions.map(action => ({
      ...action,
      ...(action.resultApis === undefined
        ? {}
        : {
            resultApis: action.resultApis.map(ref => ({
              resultPath: [...ref.resultPath],
              $ref: ref.$ref,
            })),
          }),
    })),
  }
}

function splitAttributeApiRef(
  api: AiApiObjectMetadataCompact,
  registry: Readonly<Record<string, AiApiObjectMetadataCompact>>,
): KindFileApi {
  if (registry[api.kind] !== undefined) {
    return { $ref: api.kind }
  }
  return splitApiForKindFile(api, registry)
}

function collectImportKinds(api: KindFileApi): string[] {
  const kinds = new Set<string>()
  const attributes = Array.isArray(api['attributes']) ? api['attributes'] : []
  for (const attribute of attributes) {
    if (!isRecord(attribute)) continue
    const child = attribute['api']
    if (child === undefined) continue
    if (isKindRef(child)) {
      kinds.add(child.$ref)
      continue
    }
    if (isFullApi(child)) {
      kinds.add(child.kind)
      for (const nested of collectImportKinds(child)) kinds.add(nested)
    }
  }
  const actions = Array.isArray(api['actions']) ? api['actions'] : []
  for (const action of actions) {
    if (!isRecord(action)) continue
    const resultApis = action['resultApis']
    if (!Array.isArray(resultApis)) continue
    for (const ref of resultApis) {
      if (isRecord(ref) && typeof ref['$ref'] === 'string') kinds.add(ref['$ref'])
    }
  }
  return [...kinds].sort()
}

function collectAttributeApiEdges(
  rootApi: AiApiObjectMetadataCompact,
  registry: Readonly<Record<string, AiApiObjectMetadataCompact>>,
): Array<{ from: string; attribute: string; to: string }> {
  const edges: Array<{ from: string; attribute: string; to: string }> = []
  const visited = new Set<string>()
  const queue: AiApiObjectMetadataCompact[] = [rootApi]
  while (queue.length > 0) {
    const api = queue.shift()
    if (api === undefined || visited.has(api.kind)) continue
    visited.add(api.kind)
    for (const attribute of api.attributes ?? []) {
      const childKind = attribute.api?.kind ?? (isKindRef(attribute.api) ? attribute.api.$ref : undefined)
      if (childKind === undefined || childKind.length === 0) continue
      edges.push({ from: api.kind, attribute: attribute.name, to: childKind })
      const childApi = registry[childKind] ?? (isFullApi(attribute.api) ? attribute.api : undefined)
      if (childApi !== undefined) queue.push(childApi)
    }
  }
  return edges
}

function isKindRef(value: unknown): value is { $ref: string } {
  return isRecord(value) && typeof value['$ref'] === 'string'
}

function isFullApi(value: unknown): value is AiApiObjectMetadataCompact {
  return isRecord(value) && typeof value['kind'] === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
