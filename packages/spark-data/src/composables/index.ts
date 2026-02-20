/**
 * spark-data Vue Composables
 *
 * 数据管理相关的 Vue Composables，负责将纯数据对象与 Vue 响应式系统桥接。
 * 消费者应先安装 Vue 3.5+。
 */

export { usePageDataSet } from './usePageDataSet'
export type { UsePageDataSetOptions, UsePageDataSetReturn } from './usePageDataSet'
