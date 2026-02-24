/**
 * 通用的运行时组件自动注册工具
 *
 * 此模块属于 spark-app 包，可在任意项目中直接安装使用，
 * 并支持通过参数配置 glob 模式与排除项。
 */

import type { App } from 'vue'
import { Spark } from '@spark-view/spark-component'
import { Logger } from '@spark-view/spark-utils'

const logger = Logger('AutoRegister')

export interface AutoRegisterOptions {
  /**
   * 需要扫描的 glob 模式列表（相对于项目根）
   * 默认为 packages、features、src/components 和 src/views 下的 vue 文件
   */
  patterns?: string[]

  /**
   * 排除规则（glob 模式）
   */
  exclude?: string[]
}

const DEFAULT_PATTERNS = [
  './packages/*/src/components/**/*.vue',
  './features/**/components/**/*.vue',
  './src/components/**/*.vue',
  './src/views/**/*.vue'
]

const DEFAULT_EXCLUDE = [
  'App.vue',
  '**/node_modules/**',
  '**/dist/**',
  '**/*.test.vue',
  '**/*.spec.vue'
]

/**
 * 运行时扫描并注册所有匹配的 Vue 组件。
 *
 * 可用于经典模式启动，或在运行时动态追加组件时调用。
 */
export async function setupAutoRegister(app: App, options: AutoRegisterOptions = {}) {
  void app // 预留参数

  const patterns = options.patterns ?? DEFAULT_PATTERNS
  const exclude = options.exclude ?? DEFAULT_EXCLUDE

  logger.info('🚀 启动组件自动注册...')

  // import.meta.glob 的根目录是当前项目的 src 目录
  // 所以模式使用相对路径即可
  const allModules: Record<string, () => Promise<{ default: unknown }>> = {}

  for (const pattern of patterns) {
    const mods = import.meta.glob(pattern)
    Object.assign(allModules, mods)
  }

  // 生成注册器
  const reg = Spark.createRegister(allModules)
  const registered: string[] = []

  for (const path of Object.keys(allModules)) {
    const fileName = path.split('/').pop()?.replace('.vue', '') ?? ''
    if (!fileName) continue

    // 排除过滤
    if (exclude.some(pat => new RegExp(pat.replace(/\*/g, '.*')).test(fileName))) {
      continue
    }

    const kebab = fileName
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()

    reg.register(kebab, path)
    registered.push(kebab)
  }

  logger.info(`✅ 组件自动注册完成 (${registered.length} 个)`)
}
