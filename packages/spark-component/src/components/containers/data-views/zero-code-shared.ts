import type { DataView } from '@spark-view/spark-data'
import { createBaseCrudMethods, createCrudDispatcher } from '../support/index.js'
import type { ValueRef } from '../../shared-types.js'

interface CreateContainerCrudContextOptions {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null>
  /** CRUD 事件默认处理器；直接沿用 createCrudDispatcher 的第二个参数契约。 */
  eventDefaults?: Parameters<typeof createCrudDispatcher>[1]
}

/**
 * 容器零代码层公共上下文：支持按需注入事件默认处理（eventDefaults）。
 *
 * 初始化顺序：
 * 1. 先用 props + eventDefaults 创建统一事件分发器。
 * 2. 再把分发器接入基础 CRUD 方法，确保 create/update/delete 后能走同一套事件出口。
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
