/// <reference types="vite/client" />

declare const __SPARK_CLASSIC_MODE__: boolean

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, any>
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
  export type ComponentName = string
  
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
    name: ComponentName
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

/**
 * 虚拟模块：SPARK Skill 目录
 * 由 vite-plugin-spark-components 在构建时生成
 * 包含所有生成 Skill 元数据的组件；JSDoc 注解可覆盖默认 type/description/能力声明
 */
declare module 'virtual:spark-skill-catalog' {
  export interface PropMeta {
    name: string
    type: string
    required: boolean
    description?: string
    default?: string
  }

  export interface SkillMeta {
    /** Skill 类型名（对应组件注册名，如 'r-table'） */
    type: string
    /** 组件功能描述 */
    description?: string
    /** 该组件通过 provide() 提供的能力键列表 */
    provides: string[]
    /** 该组件通过 consume() 消费的能力键列表 */
    consumes: string[]
    /** 输入配置 schema（JSON 字符串，来自 @input 注解）*/
    inputSchema?: string
    /** rule.json 配置示例（来自 @example 注解）*/
    example?: string
    /** 组件 defineProps 提取的属性元数据 */
    props?: PropMeta[]
  }

  /** 所有生成 Skill 元数据的组件 Skill 元数据列表 */
  export const skillCatalog: SkillMeta[]

  export default skillCatalog
}