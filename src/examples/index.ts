/**
 * SPARK 组件系统示例代码索引
 * 
 * @description
 * 所有示例代码都在 src/examples/ 目录，使用项目别名 (@/) 导入，
 * 确保完整的类型检查和 IDE 智能提示。
 * 
 * @example
 * ```typescript
 * // 导入并使用示例
 * import { basicUsage } from '@/examples/auto-loader/basic-usage'
 * 
 * // 运行示例
 * await basicUsage()
 * ```
 */

// AutoLoader 运行时注册示例
export * from './auto-loader/basic-usage'
export * from './auto-loader/performance-monitoring'

// 编译时注册示例
export * from './build-time-registration/basic-usage'

/**
 * 所有可用示例列表
 */
export const examples = {
  autoLoader: {
    basicUsage: () => import('./auto-loader/basic-usage'),
    performanceMonitoring: () => import('./auto-loader/performance-monitoring')
  },
  buildTimeRegistration: {
    basicUsage: () => import('./build-time-registration/basic-usage')
  }
} as const

/**
 * 示例分类
 */
export type ExampleCategory = keyof typeof examples

/**
 * 获取示例列表
 */
export function getExampleList(): string[] {
  return [
    'auto-loader/basic-usage',
    'auto-loader/performance-monitoring',
    'build-time-registration/basic-usage'
  ]
}

/**
 * 运行指定示例
 */
export async function runExample(name: string): Promise<void> {
  const [category, exampleName] = name.split('/')
  
  if (category === 'auto-loader') {
    await examples.autoLoader[exampleName as keyof typeof examples.autoLoader]()
  } else if (category === 'build-time-registration') {
    await examples.buildTimeRegistration[exampleName as keyof typeof examples.buildTimeRegistration]()
  }
}
