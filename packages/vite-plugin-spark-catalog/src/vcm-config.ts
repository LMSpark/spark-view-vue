import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ModuleAbilityMetadataGeneratorOptions } from './module-metadata-generator'

export const VCM_CONFIG_FILE_NAME = 'config/vcm/registry.json'
export const VCM_CONFIG_PROTOCOL = 'spark-appworks.vcm.registry'
export const VCM_CONFIG_SCHEMA_VERSION = 1
export const VCM_METADATA_TARGET_KIND = 'native-metadata'

export type VcmMetadataTargetKind = typeof VCM_METADATA_TARGET_KIND

export type VcmMetadataRoot = Readonly<{
  className: string
  kind?: string
}>

export type VcmMetadataTargetSource = Readonly<{
  files: readonly string[]
}>

export type VcmMetadataTargetOutputs = Readonly<{
  runtime: string
  jsdocTodoLog: string
  /** @deprecated 使用根级 componentCatalogOutput；target 级字段仅作过渡读取。 */
  componentCatalog?: string
}>

export type VcmMetadataTarget = Readonly<{
  id: string
  kind: VcmMetadataTargetKind
  description?: string
  source: VcmMetadataTargetSource
  roots: readonly VcmMetadataRoot[]
  outputs: VcmMetadataTargetOutputs
}>

export const VCM_DEFAULT_COMPONENT_CATALOG_OUTPUT = 'generated/vcm/component-catalog.json'

export type VcmMetadataConfig = Readonly<{
  $schema?: string
  protocol: typeof VCM_CONFIG_PROTOCOL
  schemaVersion: typeof VCM_CONFIG_SCHEMA_VERSION
  /** component-catalog CLI 输出；与 metadata target 解耦。 */
  componentCatalogOutput?: string
  metadataTargets: readonly VcmMetadataTarget[]
}>

export type CreateVcmTargetGeneratorOptionsOverrides = Pick<
  ModuleAbilityMetadataGeneratorOptions,
  'trace' | 'extractResults' | 'extractResultSchemas' | 'reflectionMode' | 'writeFiles'
>

export function readVcmMetadataConfig(
  root: string,
  configFile = VCM_CONFIG_FILE_NAME,
): VcmMetadataConfig {
  const configPath = resolve(root, configFile)
  if (!existsSync(configPath)) {
    throw new Error(`VCM config not found: ${configPath}`)
  }
  const document = parseJson(readFileSync(configPath, 'utf8'), configPath)
  return parseVcmMetadataConfig(document, configPath)
}

export function findVcmMetadataTarget(
  config: VcmMetadataConfig,
  targetId: string,
): VcmMetadataTarget {
  const target = config.metadataTargets.find(item => item.id === targetId)
  if (target === undefined) {
    throw new Error(`VCM target "${targetId}" not found. Available targets: ${config.metadataTargets.map(item => item.id).join(', ')}`)
  }
  return target
}

export function resolveComponentCatalogOutput(
  config: VcmMetadataConfig,
  target?: VcmMetadataTarget,
): string {
  const rootOutput = config.componentCatalogOutput?.trim()
  if (rootOutput !== undefined && rootOutput.length > 0) return rootOutput
  const legacyOutput = target?.outputs.componentCatalog?.trim()
  if (legacyOutput !== undefined && legacyOutput.length > 0) return legacyOutput
  return VCM_DEFAULT_COMPONENT_CATALOG_OUTPUT
}

export function createVcmTargetGeneratorOptions(
  target: VcmMetadataTarget,
  overrides: CreateVcmTargetGeneratorOptionsOverrides = {},
): ModuleAbilityMetadataGeneratorOptions {
  return {
    sources: target.source.files,
    apiRoots: target.roots.map(root => root.className),
    moduleRuntimeOutFile: target.outputs.runtime,
    jsdocTodoLogOutFile: target.outputs.jsdocTodoLog,
    ...overrides,
  }
}

function parseJson(raw: string, configPath: string): unknown {
  try {
    return JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid VCM config JSON at ${configPath}: ${message}`)
  }
}

function parseVcmMetadataConfig(document: unknown, configPath: string): VcmMetadataConfig {
  const root = requireRecord(document, configPath)
  const schema = optionalString(root, '$schema', configPath)
  const protocol = root['protocol']
  if (protocol !== VCM_CONFIG_PROTOCOL) {
    throw new Error(`${configPath}: protocol must be "${VCM_CONFIG_PROTOCOL}".`)
  }
  const schemaVersion = root['schemaVersion']
  if (schemaVersion !== VCM_CONFIG_SCHEMA_VERSION) {
    throw new Error(`${configPath}: schemaVersion must be ${String(VCM_CONFIG_SCHEMA_VERSION)}.`)
  }
  const targetsValue = root['metadataTargets']
  if (!Array.isArray(targetsValue) || targetsValue.length === 0) {
    throw new Error(`${configPath}: metadataTargets must be a non-empty array.`)
  }
  const targets = targetsValue.map((target, index) => parseVcmMetadataTarget(target, `${configPath}:metadataTargets[${String(index)}]`))
  assertUniqueTargetIds(targets, configPath)
  const componentCatalogOutput = optionalString(root, 'componentCatalogOutput', configPath)
  return {
    ...(schema === undefined ? {} : { $schema: schema }),
    protocol: VCM_CONFIG_PROTOCOL,
    schemaVersion: VCM_CONFIG_SCHEMA_VERSION,
    ...(componentCatalogOutput === undefined ? {} : { componentCatalogOutput }),
    metadataTargets: targets,
  }
}

function parseVcmMetadataTarget(value: unknown, path: string): VcmMetadataTarget {
  const target = requireRecord(value, path)
  const description = optionalString(target, 'description', path)
  const kind = target['kind']
  if (kind !== VCM_METADATA_TARGET_KIND) {
    throw new Error(`${path}.kind must be "${VCM_METADATA_TARGET_KIND}".`)
  }
  return {
    id: requiredString(target, 'id', path),
    kind: VCM_METADATA_TARGET_KIND,
    ...(description === undefined ? {} : { description }),
    source: parseVcmMetadataTargetSource(target['source'], `${path}.source`),
    roots: parseVcmMetadataRoots(target['roots'], `${path}.roots`),
    outputs: parseVcmMetadataTargetOutputs(target['outputs'], `${path}.outputs`),
  }
}

function parseVcmMetadataTargetSource(value: unknown, path: string): VcmMetadataTargetSource {
  const source = requireRecord(value, path)
  return {
    files: requiredStringArray(source, 'files', path),
  }
}

function parseVcmMetadataRoots(value: unknown, path: string): readonly VcmMetadataRoot[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty array.`)
  }
  const roots = value.map((item, index) => parseVcmMetadataRoot(item, `${path}[${String(index)}]`))
  assertUniqueRootClassNames(roots, path)
  return roots
}

function parseVcmMetadataRoot(value: unknown, path: string): VcmMetadataRoot {
  const root = requireRecord(value, path)
  const kind = optionalString(root, 'kind', path)
  return {
    className: requiredString(root, 'className', path),
    ...(kind === undefined ? {} : { kind }),
  }
}

function parseVcmMetadataTargetOutputs(value: unknown, path: string): VcmMetadataTargetOutputs {
  const outputs = requireRecord(value, path)
  const componentCatalog = optionalString(outputs, 'componentCatalog', path)
  return {
    runtime: requiredString(outputs, 'runtime', path),
    jsdocTodoLog: requiredString(outputs, 'jsdocTodoLog', path),
    ...(componentCatalog === undefined ? {} : { componentCatalog }),
  }
}

function assertUniqueTargetIds(targets: readonly VcmMetadataTarget[], configPath: string): void {
  const seen = new Set<string>()
  for (const target of targets) {
    if (seen.has(target.id)) {
      throw new Error(`${configPath}: duplicated VCM target id "${target.id}".`)
    }
    seen.add(target.id)
  }
}

function assertUniqueRootClassNames(roots: readonly VcmMetadataRoot[], path: string): void {
  const seen = new Set<string>()
  for (const root of roots) {
    if (seen.has(root.className)) {
      throw new Error(`${path}: duplicated VCM root className "${root.className}".`)
    }
    seen.add(root.className)
  }
}

function requireRecord(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (isRecord(value)) return value
  throw new Error(`${path}: expected an object.`)
}

function requiredString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path}.${key} must be a non-empty string.`)
  }
  return value.trim()
}

function optionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new Error(`${path}.${key} must be a string when provided.`)
  }
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function requiredStringArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): readonly string[] {
  const value = record[key]
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path}.${key} must be a non-empty string array.`)
  }
  return value.map((item, index) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new Error(`${path}.${key}[${String(index)}] must be a non-empty string.`)
    }
    return item.trim()
  })
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
