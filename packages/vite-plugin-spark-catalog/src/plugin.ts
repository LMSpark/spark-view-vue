/**
 * SPARK 组件目录生成 Vite 插件
 *
 * 目录文件由 git 跟踪，始终存在。插件仅在两个场景生成：
 * - HMR：dev 时 .vue 变更自动重新生成
 * - CLI：`pnpm run generate:catalog`（build:check 中 vue-tsc 前调用）
 *
 * configResolved 不扫描，避免每次 dev/build 重复开销。
 *
 * @module plugin
 */

import type { Plugin } from 'vite'
import { generateJsonCatalog } from './json-catalog-generator'
import type { VcmCheckerOptions } from './extract-component-api-vcm'
import { createLogger, normalizePath } from './utils'

const logger = createLogger('spark-catalog')

/* --------------------------------------------------------------------------
 * 插件选项
 * ----------------------------------------------------------------------- */

export type SparkCatalogPluginOptions = {
  /** Feature 组件的 glob 扫描模式（相对于项目 root） */
  featurePatterns?: string[]
  /** 排除模式 */
  exclude?: string[]
  /** 启用详细日志 */
  verbose?: boolean
  /** 是否保留 VCM 全局 props（class/style/key/ref 等） */
  includeGlobalProps?: boolean
  /** 透传给 vue-component-meta createChecker 的选项 */
  vcmCheckerOptions?: VcmCheckerOptions
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
        logger.debug('🔄 检测到组件变更，重新生成 component-catalog.json ...')
        generateJsonCatalog(root, {
          featurePatterns: options.featurePatterns,
          exclude: options.exclude,
          verbose: options.verbose,
          includeGlobalProps: options.includeGlobalProps,
          vcmCheckerOptions: options.vcmCheckerOptions,
        })
      }
    },
  }
}
