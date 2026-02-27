/**
 * @spark-view/spark-data/data-key — DataKey 解析子路径导出
 */
export {
  isDataKey, parseDataKey,
  resolveDataKey, resolveDataKeyAsSource, resolveDataKeyBinding,
  resolveRawKey, getViewFromRawKey,
  buildDataKey, getViewKey
} from './core/data-key'

export type {
  DataKeyDescriptor, DataKeyField, DataKeyBinding
} from './core/data-key'
