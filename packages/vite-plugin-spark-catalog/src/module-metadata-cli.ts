#!/usr/bin/env node
/**
 * 独立 AI 能力模块元数据生成命令。
 *
 * 用法：
 *   pnpm run generate:module-metadata
 */
import { resolve } from 'node:path'
import { generatePageDesignModuleMetadata } from './module-metadata-generator'
import { createLogger } from './utils'

const logger = createLogger('module-metadata-cli')
const root = resolve(import.meta.dirname, '../../..')

logger.info('🚀 开始生成 AI 能力模块元数据 ...')
const result = generatePageDesignModuleMetadata(root)
logger.info(`✅ ${result.abilities.length} 个能力模块元数据已写入 ${result.outFile}`)
