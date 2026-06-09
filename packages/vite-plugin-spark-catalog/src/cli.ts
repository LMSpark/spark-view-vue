#!/usr/bin/env node
/**
 * 独立 Catalog 生成命令（不依赖 Vite 运行时）
 *
 * 调用 json-catalog-generator 生成单一 rich component-catalog.json。
 * 输出路径来自 config/vcm/registry.json 的 componentCatalogOutput。
 *
 * 用法：
 *   npx tsx packages/vite-plugin-spark-catalog/src/cli.ts
 */

import { resolve } from 'node:path'
import { generateJsonCatalog } from './json-catalog-generator'
import type { VcmCheckerOptions } from './extract-component-api-vcm'
import {
  COMPONENT_SCAN_PATTERNS,
  COMPONENT_EXCLUDE_PATTERNS,
  CATALOG_FEATURE_EXCLUDE_PATTERNS,
} from './scan-config'
import {
  VCM_CONFIG_FILE_NAME,
  readVcmMetadataConfig,
  resolveComponentCatalogOutput,
} from './vcm-config'
import { createLogger } from './utils'

const logger = createLogger('catalog-cli')

const root = resolve(import.meta.dirname, '../../..')
const configFile = readCliOption('--config') ?? VCM_CONFIG_FILE_NAME
const vcmConfig = readVcmMetadataConfig(root, configFile)
const catalogOutFile = resolveComponentCatalogOutput(vcmConfig)

function parseBooleanEnv(name: string): boolean | undefined {
  const raw = process.env[name]
  if (raw === undefined) return undefined

  const normalized = raw.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true') return true
  if (normalized === '0' || normalized === 'false') return false

  logger.warn(`⚠️ 忽略非法布尔环境变量 ${name}=${raw}`)
  return undefined
}

function pickDefinedVcmOptions(source: {
  rawType: boolean | undefined
  schema: boolean | undefined
  noDeclarations: boolean | undefined
}): VcmCheckerOptions {
  const options: VcmCheckerOptions = {}
  if (source.rawType !== undefined) options.rawType = source.rawType
  if (source.schema !== undefined) options.schema = source.schema
  if (source.noDeclarations !== undefined) options.noDeclarations = source.noDeclarations
  return options
}

const vcmCheckerOptions: VcmCheckerOptions = pickDefinedVcmOptions({
  rawType: parseBooleanEnv('SPARK_CATALOG_VCM_RAW_TYPE'),
  schema: parseBooleanEnv('SPARK_CATALOG_VCM_SCHEMA'),
  noDeclarations: parseBooleanEnv('SPARK_CATALOG_VCM_NO_DECLARATIONS'),
})

const includeGlobalProps = parseBooleanEnv('SPARK_CATALOG_INCLUDE_GLOBAL_PROPS') ?? false

logger.info(`🚀 开始生成组件目录 ... config=${configFile} output=${catalogOutFile}`)

generateJsonCatalog(root, {
  featurePatterns: [...COMPONENT_SCAN_PATTERNS],
  exclude: [...COMPONENT_EXCLUDE_PATTERNS, ...CATALOG_FEATURE_EXCLUDE_PATTERNS],
  includeGlobalProps,
  catalogOutFile,
  vcmCheckerOptions,
})

logger.info(`✅ component-catalog.json 已写入 ${catalogOutFile}`)

function readCliOption(name: string): string | undefined {
  const equalsPrefix = `${name}=`
  const equalsArg = process.argv.find(arg => arg.startsWith(equalsPrefix))
  if (equalsArg !== undefined) {
    const value = equalsArg.slice(equalsPrefix.length).trim()
    return value.length === 0 ? undefined : value
  }
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]?.trim()
  return value === undefined || value.length === 0 || value.startsWith('--') ? undefined : value
}
