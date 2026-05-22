/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

/**
 * 虚拟模块：SPARK 组件自动注册
 * 由 vite-plugin-spark-components 在构建时生成
 */
declare module 'virtual:spark-components' {
  import type { App, Component } from 'vue'

  /**
   * 组件名称（kebab-case）
   */
  // 这里不再为 JS 基础类型保留导出别名，组件名称直接使用 string。

  /**
   * 组件统计信息
   */
  export interface ComponentStats {
    /** 组件总数 */
    total: number
    /** 同步加载组件数量 */
    sync: number
    /** 异步加载组件数量 */
    async: number
    /** 所有组件的 Map */
    components: Map<string, Component>
  }

  /**
   * 组件元数据
   */
  export interface ComponentMetadata {
    /** 组件名称 */
    name: string
    /** 文件路径 */
    path: string
    /** 文件大小 (KB) */
    size: number
    /** 加载策略 */
    strategy: 'sync' | 'async'
  }

  /**
   * 注册所有组件到 SPARK Registry
   *
   * @param app - Vue 应用实例（可选）
   * @returns 组件统计信息
   *
   * @example
   * ```typescript
   * import { registerComponents } from 'virtual:spark-components'
   *
   * const app = createApp(App)
   * const stats = registerComponents(app)
   * console.log(`已注册 ${stats.total} 个组件`)
   * ```
   */
  export function registerComponents(app?: App): ComponentStats

  /**
   * 获取所有组件的元数据
   *
   * @returns 组件元数据数组
   *
   * @example
   * ```typescript
   * import { getComponentMetadata } from 'virtual:spark-components'
   *
   * const metadata = getComponentMetadata()
   * const largeComponents = metadata.filter(c => c.size > 100)
   * console.log('大文件组件:', largeComponents)
   * ```
   */
  export function getComponentMetadata(): ComponentMetadata[]

  /**
   * 默认导出
   */
  export default registerComponents
}

