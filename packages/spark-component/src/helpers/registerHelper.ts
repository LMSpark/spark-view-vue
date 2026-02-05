/**
 * SPARK 组件注册简化助手
 * 
 * 提供更友好的组件注册 API，自动处理：
 * - 组件类型名称转换（name → kebab-case type）
 * - 默认版本号
 * - 懒加载 loader 包装
 * - 加载完成回调
 */

import { Logger } from '@spark-view/spark-utils'
import type { ComponentConfig } from '../types/spark-component.js'

const logger = Logger('Spark:RegisterHelper')

/**
 * 简化的组件注册配置
 */
export interface SimpleComponentConfig {
  /** 组件名称（如 'HeavyGrid'），自动转换为 kebab-case type */
  name: string
  
  /** 组件路径（有 path 自动懒加载） */
  path?: string
  
  /** 组件本身（已导入的组件） */
  component?: unknown
  
  /** 版本号（默认 '1.0.0'） */
  version?: string
  
  /** 加载完成回调 */
  onLoad?: (component: unknown) => void
}

/**
 * 将组件名称转换为 kebab-case 类型
 * 
 * @example
 * 'HeavyGrid' → 'heavy-grid'
 * 'SparkEJ2Grid' → 'spark-ej2-grid'
 * 'MyButton' → 'my-button'
 */
export function nameToType(name: string): string {
  return name
    // 在大写字母前插入连字符（但不在开头）
    .replace(/([A-Z])/g, (match, _p1, offset) => 
      offset > 0 ? `-${match.toLowerCase()}` : match.toLowerCase()
    )
    .toLowerCase()
}

/**
 * 简化的组件注册方法
 * 
 * 自动处理类型转换、loader 包装、默认值等
 * 
 * @example
 * ```typescript
 * // 同步注册
 * registerComponent({
 *   name: 'MyButton',
 *   component: MyButtonComponent
 * })
 * 
 * // 异步注册（推荐）- 有 path 自动懒加载
 * registerComponent({
 *   name: 'HeavyGrid',
 *   path: './components/HeavyGrid.vue',
 *   onLoad: (comp) => console.log('Grid loaded!')
 * })
 * 
 * // 批量注册
 * registerComponents([
 *   { name: 'Chart', path: './Chart.vue' },
 *   { name: 'Calendar', path: './Calendar.vue' }
 * ])
 * ```
 */
export function createSimpleRegistration(config: SimpleComponentConfig): ComponentConfig {
  // 1. 自动生成 type
  const type = nameToType(config.name)
  
  // 2. 智能判断：有 path 自动懒加载，有 component 直接使用
  const component: unknown = config.component
  let loader: (() => Promise<{ default: unknown }>) | undefined
  
  if (config.path) {
    // 有 path → 创建懒加载 loader
    const componentPath = config.path // 缓存 path 避免 ! 断言
    loader = async () => {
      try {
        logger.info(`⏳ Loading component: ${config.name}`)
        const module = await import(/* @vite-ignore */ componentPath)
        const loadedComponent = module.default ?? module
        
        // 触发加载完成回调
        if (config.onLoad) {
          try {
            config.onLoad(loadedComponent)
          } catch (error) {
            logger.warn(`onLoad callback failed for ${config.name}:`, error)
          }
        }
        
        logger.info(`✅ Loaded component: ${config.name}`)
        return { default: loadedComponent }
      } catch (error) {
        logger.error(`❌ Failed to load component: ${config.name}`, error)
        throw error
      }
    }
  } else if (!config.component) {
    // 既没有 path 也没有 component
    logger.warn(`Component "${config.name}" has neither path nor component. Nothing to register.`)
  }
  
  // 3. 构建标准配置
  const standardConfig: ComponentConfig = {
    type,
    name: config.name,
    version: config.version ?? '1.0.0',
    component,
    loader
  }
  
  return standardConfig
}

/**
 * 批量注册组件（简化版）
 * 
 * @example
 * ```typescript
 * const configs = batchCreateSimpleRegistrations([
 *   { name: 'Chart', path: './Chart.vue' },
 *   { name: 'Calendar', path: './Calendar.vue' },
 *   { name: 'Grid', path: './Grid.vue' }
 * ])
 * ```
 */
export function batchCreateSimpleRegistrations(
  configs: SimpleComponentConfig[]
): ComponentConfig[] {
  return configs.map(config => createSimpleRegistration(config))
}

/**
 * 预设配置生成器
 */
export const presets = {
  /**
   * 懒加载预设（后向兼容，建议直接传 path）
   */
  lazy(name: string, path: string, options?: Partial<SimpleComponentConfig>): SimpleComponentConfig {
    return {
      name,
      path,
      ...options
    }
  },
  
  /**
   * 同步加载预设（传入已导入的组件）
   */
  sync(name: string, component: unknown, options?: Partial<SimpleComponentConfig>): SimpleComponentConfig {
    return {
      name,
      component,
      ...options
    }
  }
}
