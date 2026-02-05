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
  
  /** 组件路径或组件本身 */
  path?: string
  component?: unknown
  
  /** 是否懒加载（默认 false） */
  lazy?: boolean
  
  /** 版本号（默认 '1.0.0'） */
  version?: string
  
  /** 加载完成回调 */
  onLoad?: (component: unknown) => void
  
  /** 能力提供者 */
  provides?: string[]
  
  /** 能力消费者 */
  requires?: string[]
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
 * // 异步注册（推荐）
 * registerComponent({
 *   name: 'HeavyGrid',
 *   path: './components/HeavyGrid.vue',
 *   lazy: true,
 *   onLoad: (comp) => console.log('Grid loaded!')
 * })
 * 
 * // 批量注册
 * registerComponents([
 *   { name: 'Chart', path: './Chart.vue', lazy: true },
 *   { name: 'Calendar', path: './Calendar.vue', lazy: true }
 * ])
 * ```
 */
export function createSimpleRegistration(config: SimpleComponentConfig): ComponentConfig {
  // 1. 自动生成 type
  const type = nameToType(config.name)
  
  // 2. 处理同步/异步
  const component: unknown = config.component
  let loader: (() => Promise<{ default: unknown }>) | undefined
  
  if (config.lazy && config.path) {
    // 懒加载模式
    loader = async () => {
      try {
        logger.info(`⏳ Loading component: ${config.name}`)
        const pathValue = config.path
        if (!pathValue) {
          throw new Error(`Component ${config.name} has lazy=true but no path`)
        }
        const module = await import(/* @vite-ignore */ pathValue)
        const loadedComponent = module.default || module
        
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
  } else if (config.path && !config.component) {
    // 提示：path 需要配合 lazy: true 使用
    logger.warn(`Component "${config.name}" has path but lazy=false. Use lazy:true or provide component directly.`)
  }
  
  // 3. 构建标准配置
  const standardConfig: ComponentConfig = {
    type,
    name: config.name,
    version: config.version || '1.0.0',
    component,
    loader
  }
  
  // 4. 能力系统
  if (config.provides) {
    standardConfig.providers = config.provides.map(name => ({
      name,
      version: config.version || '1.0.0',
      implementation: {} // 需要在组件内部提供实现
    }))
  }
  
  if (config.requires) {
    standardConfig.consumers = config.requires.map(name => ({
      capabilityName: name,
      minVersion: '1.0.0'
    }))
  }
  
  return standardConfig
}

/**
 * 批量注册组件（简化版）
 * 
 * @example
 * ```typescript
 * const configs = batchCreateSimpleRegistrations([
 *   { name: 'Chart', path: './Chart.vue', lazy: true },
 *   { name: 'Calendar', path: './Calendar.vue', lazy: true },
 *   { name: 'Grid', path: './Grid.vue', lazy: true }
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
   * 懒加载预设
   */
  lazy(name: string, path: string, options?: Partial<SimpleComponentConfig>): SimpleComponentConfig {
    return {
      name,
      path,
      lazy: true,
      ...options
    }
  },
  
  /**
   * 同步加载预设
   */
  sync(name: string, component: unknown, options?: Partial<SimpleComponentConfig>): SimpleComponentConfig {
    return {
      name,
      component,
      lazy: false,
      ...options
    }
  },
  
  /**
   * 带能力的组件
   */
  withCapabilities(
    name: string, 
    pathOrComponent: string | unknown,
    provides: string[],
    requires: string[] = []
  ): SimpleComponentConfig {
    const isPath = typeof pathOrComponent === 'string'
    return {
      name,
      ...(isPath ? { path: pathOrComponent as string, lazy: true } : { component: pathOrComponent }),
      provides,
      requires
    }
  }
}
