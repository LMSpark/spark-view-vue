/**
 * 组件层共享类型——容器 & 字段均可引用。
 *
 * ValueRef<T> 是 Vue Ref<T> 的最小结构约束，
 * 用于纯 TS 文件中接受 ref-like 对象而无需 import vue。
 */
import type { SparkNode } from '../core/types.js'

export interface ValueRef<T> {
  value: T
}

export interface SparkRuntimeProps<TType extends string = string> {
  type?: TType
  id?: string
}

export interface SparkRuntimeChildrenProps<TType extends string = string> extends SparkRuntimeProps<TType> {
  children?: SparkNode[]
}
