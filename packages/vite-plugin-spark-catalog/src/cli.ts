#!/usr/bin/env node
/**
 * 独立 Catalog 生成命令（不依赖 Vite 运行时）
 *
 * 复用 json-catalog-generator / catalog-generator 中的纯 Node.js 生成函数，
 * 仅需项目 root 路径即可执行全量目录生成。
 *
 * 用法：
 *   npx tsx packages/vite-plugin-spark-catalog/src/cli.ts
 *   pnpm run generate:catalog
 */

import { resolve } from 'node:path'
import { generateJsonCatalog, generateSapCatalogFiles, generateDevSystemCatalog } from './json-catalog-generator'
import { generatePropsCatalog } from './catalog-generator'
import { COMPONENT_SCAN_PATTERNS, COMPONENT_EXCLUDE_PATTERNS } from './scan-config'
import { createLogger } from './utils'

const logger = createLogger('catalog-cli')

const root = resolve(import.meta.dirname, '../../..')

logger.info('🚀 开始独立生成组件目录 ...')

const catalog = generateJsonCatalog(root, {
  featurePatterns: [...COMPONENT_SCAN_PATTERNS],
  exclude: [...COMPONENT_EXCLUDE_PATTERNS],
})
generatePropsCatalog(root, {}, catalog)
generateSapCatalogFiles(root, catalog)
generateDevSystemCatalog(root, catalog)

logger.info('✅ 所有目录文件生成完毕')
