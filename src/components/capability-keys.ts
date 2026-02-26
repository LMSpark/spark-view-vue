/**
 * Renderer 组件层能力键定义
 *
 * 用 SPARK 能力系统替代 Vue provide/inject：
 * - FIELD_CONTEXT：容器告知字段组件当前渲染上下文（table/form/detail/tree）
 * - CONTEXT_DATA ：容器向字段组件提供可写的响应式数据对象
 *
 * @example
 * // 容器组件（provider）
 * const { provide } = useSparkComponent({ type: 'r-form' })
 * provide(FIELD_CONTEXT, 'form')
 * provide(CONTEXT_DATA, formModel)
 *
 * // 字段组件（consumer）
 * const { consume } = useSparkComponent({ type: 'r-text' })
 * const context = consume(FIELD_CONTEXT) ?? 'detail'
 * const data    = consume(CONTEXT_DATA)  ?? {}
 */
import { defineCapability } from '@spark-view/spark-utils'

/** 字段渲染上下文类型 */
export type FieldContext = 'table' | 'form' | 'detail' | 'tree'

// 将本层自定义能力合并到 CapabilityTypeMap，消费方按字符串名称即可得到精确类型。
declare module '@spark-view/spark-utils' {
  interface CapabilityTypeMap {
    /** 容器告知字段组件当前渲染上下文（table/form/detail/tree） */
    'app:field-context': FieldContext
    /** 容器向字段组件提供可写的响应式数据对象 */
    'app:context-data': Record<string, unknown>
  }
}

/**
 * 字段渲染上下文能力键
 * 容器组件 provide，字段组件 consume，决定字段的渲染形态
 */
export const FIELD_CONTEXT = defineCapability<FieldContext>('app:field-context')

/**
 * 字段数据上下文能力键
 * 容器组件 provide 响应式数据对象，字段组件 consume 后读写字段值
 */
export const CONTEXT_DATA = defineCapability<Record<string, unknown>>('app:context-data')
