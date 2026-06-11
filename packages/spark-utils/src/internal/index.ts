/**
 * @module @spark-appworks/spark-utils:internal/index
 * @spark-appworks/spark-utils 的 internal/index 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
export {
  isRecord,
  isObject,
  isCallable,
  copyOwnEnumerableProperties,
  readProperty,
  readPrototypeProperty,
  readStringProperty,
  readNonEmptyStringProperty,
  readNumberProperty,
  readBooleanProperty,
  isStringArray,
  readStringArrayProperty,
} from './guards'
