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
Spark.register({ name: 'UserGrid', path: './UserGrid.vue' })
Spark.register({ name: 'UserRow', path: './UserRow.vue' })
Spark.register({ name: 'UserField', path: './UserField.vue' })
