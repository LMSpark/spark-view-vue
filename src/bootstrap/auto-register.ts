/**
 * 运行时组件自动注册引导程序（包装包内实现）
 *
 * 为了方便快速上手，原先的实现位于 `src/bootstrap/auto-register.ts`。
 *
 * 现在函数已提取到 `@spark-view/spark-app` 包中，支持通过参数
 * 配置 glob 模式和排除规则。此处仅作简单的 re-export，保留
 * 旧路径兼容性。
 */

import type { App } from 'vue'
import {
  setupAutoRegister as pkgSetupAutoRegister
} from '@spark-view/spark-app'
import type { AutoRegisterOptions } from '@spark-view/spark-app'

/**
 * 运行时扫描并注册组件。
 *
 * @param app Vue 应用实例
 * @param options 可选配置（glob 模式、exclude 等）
 */
export async function setupAutoRegister(app: App, options?: AutoRegisterOptions) {
  return pkgSetupAutoRegister(app, options)
}

export type { AutoRegisterOptions } from '@spark-view/spark-app'

export default setupAutoRegister
