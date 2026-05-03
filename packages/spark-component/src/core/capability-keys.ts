/**
 * spark-component 数据层能力键定义。
 *
 * 仅保留依赖 @spark-view/spark-data 类型的三个键；
 * 其余能力键已上移至 @spark-view/spark-utils。
 */

import { defineCapability } from '@spark-view/spark-utils'
import type { IDataRow, IDataSet, IDataSource } from '@spark-view/spark-data'

declare module '@spark-view/spark-utils' {
  interface CapabilityTypeMap {
    'spark:capability:page-dataset': IDataSet
    'spark:capability:data-source': IDataSource
    'spark:capability:data-row': IDataRow
  }
}

export const PAGE_DATASET = defineCapability<IDataSet>('spark:capability:page-dataset')
export const DATA_SOURCE = defineCapability<IDataSource>('spark:capability:data-source')
export const DATA_ROW = defineCapability<IDataRow>('spark:capability:data-row')
