/**
 * Runtime module metadata document envelope (schemaVersion=2, pooled $defs, compact modules).
 *
 * 生产路径：generate:module-metadata → standardize/pool → Draft 2020-12 audit → JSON；
 * 生成器 *.runtime.ts 做一次性类型断言；business 层不解析 JSON。
 * 本 reader 仅用于测试或非生成管线的 ad-hoc 校验。
 */

import type { AiModuleMetadataJson } from './ai-api-object-metadata-schema'

export const MODULE_METADATA_RUNTIME_JSON_SCHEMA = 'https://json-schema.org/draft/2020-12/schema' as const

export type ModuleMetadataRuntimeDocument = Readonly<{
  $schema: typeof MODULE_METADATA_RUNTIME_JSON_SCHEMA
  schemaVersion: 2
  generatedBy: string
  note: string
  $defs?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  modules: readonly AiModuleMetadataJson[]
}>

export function readModuleMetadataRuntimeDocument(value: unknown): ModuleMetadataRuntimeDocument {
  if (!isPlainObject(value)) {
    throw new Error('Module metadata runtime document must be an object.')
  }
  if (value['$schema'] !== MODULE_METADATA_RUNTIME_JSON_SCHEMA) {
    throw new Error(`Module metadata runtime document $schema must be ${MODULE_METADATA_RUNTIME_JSON_SCHEMA}.`)
  }
  if (value['schemaVersion'] !== 2) {
    throw new Error('Module metadata runtime document schemaVersion must be 2.')
  }
  const generatedBy = value['generatedBy']
  const note = value['note']
  if (typeof generatedBy !== 'string' || typeof note !== 'string') {
    throw new Error('Module metadata runtime document generatedBy/note must be strings.')
  }
  const modules = value['modules']
  if (!Array.isArray(modules) || modules.length === 0) {
    throw new Error('Module metadata runtime document modules must be a non-empty array.')
  }
  const parsedModules: AiModuleMetadataJson[] = []
  for (const module of modules) {
    assertModuleMetadataJson(module)
    parsedModules.push(module)
  }
  const defs = readRuntimeSchemaDefs(value['$defs'])
  return {
    $schema: MODULE_METADATA_RUNTIME_JSON_SCHEMA,
    schemaVersion: 2,
    generatedBy,
    note,
    ...(defs === undefined ? {} : { $defs: defs }),
    modules: parsedModules,
  }
}

function readRuntimeSchemaDefs(
  value: unknown,
): Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) {
    throw new Error('Module metadata runtime document $defs must be an object when present.')
  }
  const defs: Record<string, Readonly<Record<string, unknown>>> = {}
  for (const [name, definition] of Object.entries(value)) {
    if (!isPlainObject(definition)) {
      throw new Error(`Module metadata runtime document $defs["${name}"] must be an object.`)
    }
    defs[name] = definition
  }
  return defs
}

function assertModuleMetadataJson(value: unknown): asserts value is AiModuleMetadataJson {
  if (!isPlainObject(value)) {
    throw new Error('Module metadata entry must be an object.')
  }
  const schemaVersion = value['schemaVersion']
  if (schemaVersion !== 1 && schemaVersion !== 2) {
    throw new Error('Module metadata schemaVersion must be 1 or 2.')
  }
  const rootApi = value['rootApi']
  if (!isPlainObject(rootApi)) {
    throw new Error('Module metadata rootApi must be an object.')
  }
  if (typeof rootApi['kind'] !== 'string' || rootApi['kind'].length === 0) {
    throw new Error('Module metadata rootApi.kind is required.')
  }
  if (typeof rootApi['name'] !== 'string' || rootApi['name'].length === 0) {
    throw new Error('Module metadata rootApi.name is required.')
  }
  if (typeof rootApi['description'] !== 'string') {
    throw new Error('Module metadata rootApi.description is required.')
  }
  if (!Array.isArray(rootApi['actions'])) {
    throw new Error('Module metadata rootApi.actions must be an array.')
  }
  const apiRegistry = value['apiRegistry']
  if (apiRegistry !== undefined && !isPlainObject(apiRegistry)) {
    throw new Error('Module metadata apiRegistry must be an object when present.')
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
