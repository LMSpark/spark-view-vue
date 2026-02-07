/**
 * 能力系统演示组件注册
 */
import { Spark } from '@spark-view/spark-component'

// 导出类型定义供组件使用
export type {
  User,
  SelectionCapability,
  RowDataCapability,
  AppServicesCapability,
  AppRouterCapability,
  AppLoggerCapability
} from './types'

// 注册三个级别的演示组件

// 1. 模型级组件：UserGrid
Spark.register({
  type: 'user-grid',
  name: 'UserGrid',
  loader: () => import('./UserGrid.vue')
})

// 2. 实例级组件：UserRow
Spark.register({
  type: 'user-row',
  name: 'UserRow',
  loader: () => import('./UserRow.vue')
})

// 3. 字段级组件：UserField
Spark.register({
  type: 'user-field',
  name: 'UserField',
  loader: () => import('./UserField.vue')
})
