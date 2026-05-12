#!/usr/bin/env node
/**
 * 独立 Catalog 生成命令（不依赖 Vite 运行时）
 *
 * 调用 json-catalog-generator 生成单一 rich component-catalog.json。
 * 输出写入 packages/spark-ai/src/registrations/page-design/payloads/，所有消费端按需投影。
 *
 * 用法：
 *   npx tsx packages/vite-plugin-spark-catalog/src/cli.ts
 *   pnpm run generate:catalog
 */

import { resolve } from 'node:path'
import { generateJsonCatalog } from './json-catalog-generator'
import type { VcmCheckerOptions } from './extract-component-api-vcm'
import {
  COMPONENT_SCAN_PATTERNS,
  COMPONENT_EXCLUDE_PATTERNS,
  CATALOG_FEATURE_EXCLUDE_PATTERNS,
} from './scan-config'
import { createLogger } from './utils'

const logger = createLogger('catalog-cli')

const root = resolve(import.meta.dirname, '../../..')

function parseBooleanEnv(name: string): boolean | undefined {
  const raw = process.env[name]
  if (raw === undefined) return undefined

  const normalized = raw.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true') return true
  if (normalized === '0' || normalized === 'false') return false

  logger.warn(`⚠️ 忽略非法布尔环境变量 ${name}=${raw}`)
  return undefined
}

function buildVcmCheckerOptions(): VcmCheckerOptions {
  const options: VcmCheckerOptions = {}
  const rawType = parseBooleanEnv('SPARK_CATALOG_VCM_RAW_TYPE')
  const schema = parseBooleanEnv('SPARK_CATALOG_VCM_SCHEMA')
  const noDeclarations = parseBooleanEnv('SPARK_CATALOG_VCM_NO_DECLARATIONS')
  if (rawType !== undefined) options.rawType = rawType
  if (schema !== undefined) options.schema = schema
  if (noDeclarations !== undefined) options.noDeclarations = noDeclarations
  return options
}

const vcmCheckerOptions = buildVcmCheckerOptions()

const includeGlobalProps = parseBooleanEnv('SPARK_CATALOG_INCLUDE_GLOBAL_PROPS') ?? false

logger.info('🚀 开始生成组件目录 ...')

generateJsonCatalog(root, {
  featurePatterns: [...COMPONENT_SCAN_PATTERNS],
  exclude: [...COMPONENT_EXCLUDE_PATTERNS, ...CATALOG_FEATURE_EXCLUDE_PATTERNS],
  includeGlobalProps,
  vcmCheckerOptions,
})

logger.info('✅ component-catalog.json 生成完毕')
