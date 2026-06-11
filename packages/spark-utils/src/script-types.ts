/**
 * 页面脚本共享类型 — 框架无关的基础数据结构
 *
 * 这些类型原是 spark-project-model 中 `script-context-types.ts` 的 InScript 类型，
 * 提取到 spark-utils 以在更底层复用。
 */

/** 字段渲染配置（脚本可见） */
export type FieldRenderConfig = {
    /** field 字段。 */
field: string
    /** 是否可见。 */
visible?: boolean
    /** editable 字段。 */
editable?: boolean
    /** 展示标签。 */
label?: string
    /** width 字段。 */
width?: number | string
}

/** 页面组件实例快照（脚本只读元数据） */
export type ComponentInstanceSnapshot = {
    /** 唯一标识。 */
id: string
    /** 类型标识。 */
type: string
    /** 组件属性集合。 */
props?: Record<string, unknown>
}

/** 模块上下文选项 */
export type ContextItem = {
    /** 唯一标识。 */
id: string | number
    /** 显示标题。 */
title: string
}

/** 模块级上下文快照 */
export type ContextSnapshot = {
    /** selected 字段。 */
selected: string | number | null
    /** items 字段。 */
items: readonly ContextItem[]
    /** node Id 标识。 */
nodeId: string
}
