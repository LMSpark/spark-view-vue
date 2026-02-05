/**
 * 能力系统演示组件注册
 */
import { Spark } from '@spark-view/spark-component'

// 导出类型定义供组件使用
export type {
  User,
  SelectionCapability,
  GridEventsCapability,
  RowDataCapability,
  RowEventsCapability,
  AppServicesCapability,
  AppRouterCapability,
  AppLoggerCapability
} from './types'

// 注册三个级别的演示组件

// 1. 模型级组件：UserGrid
Spark.register({
  type: 'user-grid',
  name: 'UserGrid',
  version: '1.0.0',
  loader: () => import('./UserGrid.vue'),
  metadata: {
    level: 'model',
    description: '用户列表 - 模型级组件，管理整体数据和选择',
    capabilities: {
      provides: ['selection', 'gridEvents', 'dataSource'],
      consumes: []
    }
  }
})

// 2. 实例级组件：UserRow
Spark.register({
  type: 'user-row',
  name: 'UserRow',
  version: '1.0.0',
  loader: () => import('./UserRow.vue'),
  metadata: {
    level: 'instance',
    description: '用户行 - 实例级组件，管理单条数据',
    capabilities: {
      provides: ['rowData', 'rowEvents'],
      consumes: ['selection', 'gridEvents']
    }
  }
})

// 3. 字段级组件：UserField
Spark.register({
  type: 'user-field',
  name: 'UserField',
  version: '1.0.0',
  loader: () => import('./UserField.vue'),
  metadata: {
    level: 'field',
    description: '用户字段 - 字段级组件，显示单个字段',
    capabilities: {
      provides: [],
      consumes: ['rowData', 'rowEvents']
    }
  }
})

// eslint-disable-next-line no-console
console.log('✅ Capability demo components registered:', {
  'user-grid': 'Model Level (模型级)',
  'user-row': 'Instance Level (实例级)',
  'user-field': 'Field Level (字段级)'
})
