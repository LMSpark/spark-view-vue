/**
 * 页面脚本共享类型 — 框架无关的基础数据结构
 *
 * 这些类型原是 spark-project-model 中 `script-context-types.ts` 的 InScript 类型，
 * 提取到 spark-utils 以在更底层复用。
 */

/** 字段渲染配置（脚本可见） */
export type FieldRenderConfig = {
  field: string
  visible?: boolean
  editable?: boolean
  label?: string
  width?: number | string
}

/** 页面组件实例快照（脚本只读元数据） */
export type ComponentInstanceSnapshot = {
  id: string
  type: string
  props?: Record<string, unknown>
}

/** 模块上下文选项 */
export type ContextItem = {
  id: string | number
  title: string
}

/** 模块级上下文快照 */
export type ContextSnapshot = {
  selected: string | number | null
  items: readonly ContextItem[]
  nodeId: string
}
