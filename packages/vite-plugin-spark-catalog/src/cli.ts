#!/usr/bin/env node
/**
 * 独立 Catalog 生成命令（不依赖 Vite 运行时）
 *
 * 调用 json-catalog-generator 生成 raw component-catalog.json，
 * 并同时写入 enriched 的 component-catalog.ai.json。
 * 两者都写入 packages/spark-ai/src/catalog/。
 * 所有消费端通过 catalog-projections.ts 按需投影，无需额外生成步骤。
 *
 * 用法：
 *   npx tsx packages/vite-plugin-spark-catalog/src/cli.ts
 *   pnpm run generate:catalog
 */

import { resolve } from 'node:path'
import { generateJsonCatalog } from './json-catalog-generator'
import { COMPONENT_SCAN_PATTERNS, COMPONENT_EXCLUDE_PATTERNS } from './scan-config'
import { createLogger } from './utils'

const logger = createLogger('catalog-cli')

const root = resolve(import.meta.dirname, '../../..')

logger.info('🚀 开始生成组件目录 ...')

generateJsonCatalog(root, {
  featurePatterns: [...COMPONENT_SCAN_PATTERNS],
  exclude: [...COMPONENT_EXCLUDE_PATTERNS],
})

logger.info('✅ component-catalog.json / component-catalog.ai.json 生成完毕')
