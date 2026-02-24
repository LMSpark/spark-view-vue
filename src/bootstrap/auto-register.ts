/**
 * SPARK 组件自动注册引导程序
 *
 * 使用 Spark.createRegister() + import.meta.glob 自动扫描和注册组件。
 */

import type { App } from 'vue'
import { Spark } from '@spark-view/spark-component'
import { Logger } from '@spark-view/spark-utils'

const logger = Logger('AutoRegister')

/**
 * 设置自动组件注册
 */
export async function setupAutoRegister(app: App) {
  void app // app 参数保留供后续插件注入使用

  logger.info('🚀 启动组件自动注册...')

  // packages 目录
  const pkgModules = import.meta.glob('../../packages/*/src/components/**/*.vue')
  // features 目录
  const featureModules = import.meta.glob('../features/**/components/**/*.vue')
  // src/components 目录
  const srcModules = import.meta.glob('../components/**/*.vue')
  // src/views 目录
  const viewModules = import.meta.glob('../views/**/*.vue')

  const allModules = { ...pkgModules, ...featureModules, ...srcModules, ...viewModules }

  // 从路径提取 kebab-case 组件名并注册
  const reg = Spark.createRegister(allModules as Record<string, () => Promise<{ default: unknown }>>)
  const registered: string[] = []

  for (const path of Object.keys(allModules)) {
    const fileName = path.split('/').pop()?.replace('.vue', '') ?? ''
    if (!fileName) continue
    const kebab = fileName
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()
    reg.register(kebab, path)
    registered.push(kebab)
  }

  logger.info(`✅ 组件自动注册完成 (${registered.length} 个)`)
}

export default setupAutoRegister
