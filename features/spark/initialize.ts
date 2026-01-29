// features/spark/initialize.ts
// 应用层组件初始化

import { Spark } from '@spark-view/spark-core'
import SparkEJ2Grid from './components/ej2/SparkEJ2Grid.vue'
import SparkEJ2Column from './components/ej2/SparkEJ2Column.vue'

/**
 * 初始化应用特定的SPARK组件
 */
export async function initializeAppSparkComponents(): Promise<void> {
  // 注册EJ2相关组件
  Spark.registerSparkComponents([
    {
      type: 'spark-ej2-grid',
      name: 'Spark EJ2 Grid',
      version: '1.0.0',
      component: SparkEJ2Grid,
      providers: [
        {
          name: 'column-manager',
          version: '1.0.0',
          interface: {},
          implementation: {}
        }
      ]
    },
    {
      type: 'spark-ej2-column',
      name: 'Spark EJ2 Column',
      version: '1.0.0',
      component: SparkEJ2Column,
      consumers: [
        {
          capabilityName: 'column-manager',
          minVersion: '1.0.0',
          interface: {},
          implementation: {}
        }
      ]
    }
  ])
}