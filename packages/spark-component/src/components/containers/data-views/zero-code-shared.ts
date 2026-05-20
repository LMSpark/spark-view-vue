import type { DataView } from '@spark-view/spark-data'
import { createBaseCrudMethods, createCrudDispatcher } from '../support/index.js'
import type { ValueRef } from '../../shared-types.js'

type CrudEventDefaults = Parameters<typeof createCrudDispatcher>[1]

type CreateContainerCrudContextOptions = {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null>
  eventDefaults?: CrudEventDefaults
}

/**
 * 容器零代码层公共上下文：支持按需注入事件默认处理（eventDefaults）。
 */
export function createContainerCrudContext(options: CreateContainerCrudContextOptions) {
  const { dispatch } = createCrudDispatcher(options.props, options.eventDefaults)
  const baseMethods = createBaseCrudMethods(options.resolvedView, dispatch)

  return {
    dispatch,
    baseMethods,
  }
}

/**
 * 统一读取原生组件 ref，屏蔽重复的空值与类型断言模板。
 */
export function getNativeRefValue<T>(
  nativeRef: ValueRef<unknown>,
  accept: (value: unknown) => value is T,
): T | null {
  const value = nativeRef.value
  if (value === null || value === undefined) return null
  return accept(value) ? value : null
}
