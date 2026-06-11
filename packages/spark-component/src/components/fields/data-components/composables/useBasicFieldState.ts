/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/useBasicFieldState
 * @spark-appworks/spark-component:components/fields/data-components/composables/useBasicFieldState 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: OptionalWithUndefined, BasicFieldProps, UseBasicFieldStateOptions（共 3 个 symbol）。
 */
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../../shared-types.js'
import { useFieldPermission } from '../../context/useFieldPermission'
import type { FieldPermissionProps } from '../../context/useFieldPermission'
import { useFieldControlState } from './useFieldControlState'

/** Optional With Undefined 的语义模型。 */
type OptionalWithUndefined<T> = {
  [K in keyof T]?: T[K] | undefined
}

/** Basic Field Props 的属性契约。 */
type BasicFieldProps<TValue> = FieldPermissionProps<TValue> & OptionalWithUndefined<Pick<SparkNodeProps,
    | 'type' | 'children'
  >> & OptionalWithUndefined<Pick<SparkFieldSemanticProps,
    | 'width'
    | 'resizable'
    | 'titleAlign' | 'valueAlign'
    | 'headerCellClassName' | 'cellClassName'
    | 'titleClassName' | 'valueClassName'
    | 'sortable'
  >>

/** Use Basic Field State Options 的调用配置。 */
type UseBasicFieldStateOptions<TValue> = {
    /** 组件属性集合。 */
props: BasicFieldProps<TValue>
    /** field Type 字段。 */
fieldType: string
    /** fallback Value 字段。 */
fallbackValue: TValue
    /** emit Update 回调。 */
emitUpdate: (value: TValue) => void
    /** format Display 回调。 */
formatDisplay?: (value: unknown) => string
    /** coerce 回调。 */
coerce: (rawValue: unknown) => TValue}

export function useBasicFieldState<TValue>(options: UseBasicFieldStateOptions<TValue>) {
  const permission = useFieldPermission<TValue>({
    props: options.props,
    type: options.fieldType,
    fallbackValue: options.fallbackValue,
    coerce: options.coerce,
    ...(options.formatDisplay !== undefined ? { formatDisplay: options.formatDisplay } : {}),
  })

  const { fieldCtx, handleControlledChange } = useFieldControlState<TValue>({
    props: options.props,
    fieldType: options.fieldType,
    state: permission,
    emitUpdate: value => options.emitUpdate(value),
  })

  return {
    permission,
    fieldCtx,
    handleControlledChange,
  }
}
