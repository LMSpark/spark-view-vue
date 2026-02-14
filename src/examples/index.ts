/**
 * SPARK 组件系统示例代码索引
 * 
 * @description
 * 所有示例代码都在 src/examples/ 目录，使用项目别名 (@/) 导入，
 * 确保完整的类型检查和 IDE 智能提示。
 */

// AutoLoader 运行时注册示例
export * from './auto-loader/performance-monitoring'

/**
 * 所有可用示例列表
 */
export const examples = {
  autoLoader: {
    performanceMonitoring: () => import('./auto-loader/performance-monitoring')
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
  }
}
