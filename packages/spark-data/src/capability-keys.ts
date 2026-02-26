/**
 * spark-data 能力键定义
 *
 * 数据相关能力键归属于 spark-data 包，保持包边界清晰：
 * - spark-utils 提供能力系统基础设施（defineCapability / lookup / provide）
 * - spark-data  提供数据能力键（PAGE_DATASET / DATA_SOURCE）
 *
 * 能力链：
 *   PageRenderer
 *     provide(PAGE_DATASET, dataSet)      ← DataSet 实例（页面级）
 *       ↓
 *   r-table / r-form / r-tree
 *     consume(PAGE_DATASET)               ← 取 DataSet，解析 dataKey → DataView
 *     provide(DATA_SOURCE, dataView)      ← DataView 实例（组件级）
 *       ↓
 *   r-row / r-detail / el-table-column
 *     consume(DATA_SOURCE)                ← 取 DataView（IDataSource）
 */

import { defineCapability } from '@spark-view/spark-utils'
import type { IDataSet, IDataSource } from './types'

// 将本包的能力合并到 CapabilityTypeMap，消费方按字符串名称即可得到精确类型，
// 无需 import 能力符号对象。
declare module '@spark-view/spark-utils' {
  interface CapabilityTypeMap {
    /** 页面级 DataSet（PageRenderer provide） */
    'spark:capability:page-dataset': IDataSet
    /** 组件级 DataView / IDataSource（容器组件 provide） */
    'spark:capability:data-source':  IDataSource
  }
}

/**
 * 页面级 DataSet 能力键
 *
 * 由 PageRenderer 在 initDataSet 后 provide，
 * 容器组件（r-table / r-form / r-tree 等）通过 consume 获取后
 * 自行解析 dataKey → DataView。
 */
export const PAGE_DATASET = defineCapability<IDataSet>('spark:capability:page-dataset')

/**
 * 组件级数据视图能力键（DataView / IDataSource）
 *
 * 由容器组件（r-table / r-tree）在解析完 DataView 后 provide，
 * 子行/单元格组件通过 consume 获取行数据、选中状态等。
 * 与已有的 CURRENT_ROW / SELECTION 能力配合使用。
 */
export const DATA_SOURCE = defineCapability<IDataSource>('spark:capability:data-source')
