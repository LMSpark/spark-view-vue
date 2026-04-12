#!/usr/bin/env node
/**
 * 独立 Catalog 生成命令（不依赖 Vite 运行时）
 *
 * 调用 json-catalog-generator 生成单一 rich component-catalog.json。
 * 输出写入 packages/spark-ai/src/catalog/，所有消费端按需投影。
 *
 * 用法：
 *   npx tsx packages/vite-plugin-spark-catalog/src/cli.ts
 *   pnpm run generate:catalog
 */

import { resolve } from 'node:path'
import { generateJsonCatalog } from './json-catalog-generator'
import {
  COMPONENT_SCAN_PATTERNS,
  COMPONENT_EXCLUDE_PATTERNS,
  CATALOG_FEATURE_EXCLUDE_PATTERNS,
} from './scan-config'
import { createLogger } from './utils'

const logger = createLogger('catalog-cli')

const root = resolve(import.meta.dirname, '../../..')

logger.info('🚀 开始生成组件目录 ...')

generateJsonCatalog(root, {
  featurePatterns: [...COMPONENT_SCAN_PATTERNS],
  exclude: [...COMPONENT_EXCLUDE_PATTERNS, ...CATALOG_FEATURE_EXCLUDE_PATTERNS],
})

logger.info('✅ component-catalog.json 生成完毕')
