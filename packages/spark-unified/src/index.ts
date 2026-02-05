/**
 * SPARK 统一命名空间
 * 
 * 整合所有 SPARK 子包，提供统一的 API 入口
 * 
 * @example
 * ```typescript
 * import { SPARK } from '@spark-view/spark'
 * 
 * // 组件系统
 * SPARK.Component.register({ name: 'MyButton', path: './MyButton.vue' })
 * 
 * // 数据管理
 * const ds = SPARK.Data.createDataSet({ ... })
 * 
 * // 应用启动
 * SPARK.App.start({ rootComponent: App })
 * ```
 */

import { Spark as SparkComponent } from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'
import { SparkApp } from '@spark-view/spark-app'
// import { SparkRenderer } from '@spark-view/spark-renderer' // TODO: fix Vue component types
import { Logger } from '@spark-view/spark-utils'
import type { App } from 'vue'

export const SPARK = {
  // ========================================
  // 子系统命名空间
  // ========================================
  
  /** 组件系统 - 组件注册、能力系统、动态加载 */
  Component: SparkComponent,
  
  /** 数据管理 - DataSet、TreeManager、BindingContext */
  Data: SparkData,
  
  /** 应用框架 - 应用启动、路由、生命周期 */
  App: SparkApp,
  
  /** 日志系统 */
  Logger,
  
  // ========================================
  // 快捷 API（最常用的功能）
  // ========================================
  
  /** 安装所有 SPARK 插件 */
  install(app: App) {
    app.use(SparkComponent.install)
    // 其他插件安装...
  },
  
  /** 注册组件（快捷方式） */
  register: SparkComponent.register,
  
  /** 在组件中使用 SPARK（快捷方式） */
  useSpark: SparkComponent.useSpark,
  
  /** 创建 DataSet（快捷方式） */
  createDataSet: SparkData.createDataSet,
  
  /** 创建 TreeManager（快捷方式） */
  createTreeManager: SparkData.createTreeManager,
  
  /** 启动应用（快捷方式） */
  start: SparkApp.start,
  
  // ========================================
  // 版本信息
  // ========================================
  
  version: '1.0.0',
  
  /** 获取所有子系统版本 */
  getVersions() {
    return {
      unified: this.version,
      component: '1.0.0',
      data: '1.0.0',
      app: '1.0.0',
      utils: '1.0.0'
    }
  }
}

// 默认导出
export default SPARK

// 同时导出各子系统（按需引入）
export { SparkComponent, SparkData, SparkApp, Logger }

// 类型导出
export type { ComponentConfig, SimpleComponentConfig } from '@spark-view/spark-component'
export type { IDataSet, DataRow } from '@spark-view/spark-data'
