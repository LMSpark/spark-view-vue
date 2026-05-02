import type { DataView } from '@spark-view/spark-data'
import { createBaseCrudMethods, createCrudDispatcher } from '../support/index.js'
import type { ValueRef } from '../../shared-types.js'

interface CreateContainerZeroCodeBaseOptions {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null>
}

type CrudEventDefaults = Parameters<typeof createCrudDispatcher>[1]

interface CreateContainerCrudContextOptions extends CreateContainerZeroCodeBaseOptions {
  eventDefaults?: CrudEventDefaults
}

/**
 * 容器零代码层公共基础。
 */
export function createContainerZeroCodeBase(options: CreateContainerZeroCodeBaseOptions) {
  return createContainerCrudContext(options)
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
export function getNativeRefValue<T>(nativeRef: ValueRef<unknown>): T | null {
  const value = nativeRef.value
  if (value === null || value === undefined) return null
  return value as T
}
