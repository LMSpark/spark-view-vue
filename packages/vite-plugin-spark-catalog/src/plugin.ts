/**
 * SPARK 组件 Props 目录生成 Vite 插件
 *
 * 独立插件，单一职责：在 configResolved 和 HMR 时调用 catalog-generator
 * 生成 component-props-catalog.ts。
 *
 * @module plugin
 */

import type { Plugin } from 'vite'
import { generatePropsCatalog } from './catalog-generator'
import { generateJsonCatalog, generateSapCatalogFiles, generateDevSystemCatalog } from './json-catalog-generator'
import { createLogger, normalizePath } from './utils'

const logger = createLogger('spark-catalog')

/* --------------------------------------------------------------------------
 * 插件选项
 * ----------------------------------------------------------------------- */

export interface SparkCatalogPluginOptions {
  /** Feature 组件的 glob 扫描模式（相对于项目 root） */
  featurePatterns?: string[]
  /** 排除模式 */
  exclude?: string[]
  /** 输出 TS 目录文件路径（相对于 root） */
  outputPath?: string
  /** 输出 JSON 目录文件路径（相对于 root） */
  jsonOutputPath?: string
  /** 启用详细日志 */
  verbose?: boolean
}

/* --------------------------------------------------------------------------
 * 插件工厂
 * ----------------------------------------------------------------------- */

export function sparkCatalogPlugin(options: SparkCatalogPluginOptions = {}): Plugin {
  let root = ''

  return {
    name: 'vite-plugin-spark-catalog',

    configResolved(resolvedConfig) {
      root = resolvedConfig.root
      const jsonOptions = {
        featurePatterns: options.featurePatterns,
        exclude: options.exclude,
        outputPath: options.jsonOutputPath,
        verbose: options.verbose,
      }
      const catalog = generateJsonCatalog(root, jsonOptions)
      generatePropsCatalog(root, options, catalog)
      generateSapCatalogFiles(root, catalog)
      generateDevSystemCatalog(root, catalog)
    },

    handleHotUpdate({ file }) {
      if (!file.endsWith('.vue')) return

      const normalizedFile = normalizePath(file)
      // 仅当变更的文件在 renderer 或 feature 目录时才重新生成
      const isRelevant =
        normalizedFile.includes('/packages/spark-component/src/components/') ||
        normalizedFile.includes('/packages/spark-component/src/page/') ||
        normalizedFile.includes('/features/') ||
        normalizedFile.includes('/src/components/') ||
        normalizedFile.includes('/src/views/')

      if (isRelevant) {
        logger.debug('🔄 检测到组件变更，重新生成 Props 目录...')
        const jsonOptions = {
          featurePatterns: options.featurePatterns,
          exclude: options.exclude,
          outputPath: options.jsonOutputPath,
          verbose: options.verbose,
        }
        const catalog = generateJsonCatalog(root, jsonOptions)
        generatePropsCatalog(root, options, catalog)
        generateSapCatalogFiles(root, catalog)
        generateDevSystemCatalog(root, catalog)
      }
    },
  }
}
