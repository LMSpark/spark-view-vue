import type { ComponentConfig } from '@spark-view/spark-component'

/**
 * ExampleCard 组件配置
 *
 * 一个示例卡片组件
 */
export interface ExampleCardConfig {
  /** 组件标题 */
  title?: string
  /** 是否显示加载状态 */
  loading?: boolean
  /** 自定义数据 */
  data?: Record<string, unknown>
}

/**
 * ExampleCard 组件注册配置
 */
export const exampleCardConfig: ComponentConfig = {
  type: 'example-card',
  version: '1.0.0',
  description: '一个示例卡片组件'
}

/**
 * 默认配置
 */
export const defaultExampleCardConfig: ExampleCardConfig = {
  title: 'ExampleCard',
  loading: false
}