/**
 * 内置插件预设
 * 
 * 提供常用 UI 框架的插件加载器
 */

import type { Plugin } from 'vue'
import { PluginRegistry } from './registry'

/**
 * 注册内置插件
 * 
 * 包括：
 * - element-plus: Vue 3 UI 组件库
 * - vxe-table: 强大的表格组件
 */
export function registerBuiltinPlugins(): void {
  PluginRegistry.registerAll({
    'element-plus': {
      name: 'Element Plus',
      module: 'element-plus',
      loader: () => import('element-plus') as unknown as Promise<{ default: Plugin }>,
      description: 'Vue 3 UI 组件库',
      version: '^2.5.0',
      defaultOptions: {
        size: 'default',
        zIndex: 2000
      }
    },
    
    'vxe-table': {
      name: 'VXE Table',
      module: 'vxe-table',
      loader: () => import('vxe-table') as unknown as Promise<{ default: Plugin }>,
      description: '强大的 Vue 表格组件',
      version: '^4.17.0',
      defaultOptions: {}
    }
  })
}

/**
 * 注册所有预设插件
 * 
 * 目前等同于 registerBuiltinPlugins
 */
export function registerAllPresetPlugins(): void {
  registerBuiltinPlugins()
}

/**
 * 未来扩展：注册状态管理插件（需要先安装依赖）
 * 
 * @example
 * ```typescript
 * // 安装依赖后取消注释
 * // pnpm add pinia
 * export function registerStatePlugins(): void {
 *   PluginRegistry.register('pinia', {
 *     name: 'Pinia',
 *     module: 'pinia',
 *     loader: async () => {
 *       const { createPinia } = await import('pinia')
 *       return { default: createPinia() as any }
 *     }
 *   })
 * }
 * ```
 */

/**
 * 未来扩展：注册国际化插件（需要先安装依赖）
 * 
 * @example
 * ```typescript
 * // 安装依赖后取消注释
 * // pnpm add vue-i18n
 * export function registerI18nPlugins(): void {
 *   PluginRegistry.register('vue-i18n', {
 *     name: 'Vue I18n',
 *     module: 'vue-i18n',
 *     loader: async () => {
 *       const { createI18n } = await import('vue-i18n')
 *       return { default: createI18n({ ... }) as any }
 *     }
 *   })
 * }
 * ```
 */

