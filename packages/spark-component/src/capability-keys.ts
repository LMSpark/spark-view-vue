/**
 * 数据相关能力键定义
 *
 * 能力系统属于 spark-component / spark-app 层；
 * spark-data 是纯数据层，不关心组件树或能力 DI。
 *
 * 能力链：
 *   PageRenderer
 *     provide(PAGE_DATASET, dataSet)      ← DataSet 实例（页面级）
 *       ↓
 *   容器组件（r-table / r-tree）
 *     consume(PAGE_DATASET)               ← 取 DataSet，解析 dataKey → DataView
 *     provide(DATA_SOURCE, dataView)      ← DataView 实例（组件级）
 *       ↓
 *   子组件（行 / 单元格）
 *     consume(DATA_SOURCE)                ← 取 DataView（IDataSource）
 */

import { defineCapability } from '@spark-view/spark-utils'
import type { IDataSet, IDataSource } from '@spark-view/spark-data'

// 将能力键合并到 CapabilityTypeMap，消费方按字符串名称即可得到精确类型，
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
 * 容器组件通过 consume 获取后解析 dataKey → DataView。
 */
export const PAGE_DATASET = defineCapability<IDataSet>('spark:capability:page-dataset')

/**
 * 组件级数据视图能力键（DataView / IDataSource）
 *
 * 由容器组件在解析完 DataView 后 provide，
 * 子组件通过 consume 获取行数据、选中状态等。
 * 与已有的 CURRENT_ROW / SELECTION 能力配合使用。
 */
export const DATA_SOURCE = defineCapability<IDataSource>('spark:capability:data-source')
