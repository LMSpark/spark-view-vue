/**
 * 页面脚本共享类型 — 依赖 spark-data 类型的数据结构
 *
 * 这些类型原是 spark-page-config 中 `script-context-types.ts` 的 InScript 类型，
 * 提取到 spark-data 以在正确层级复用。
 */

import type { DataRow, ModelPermission, FieldVisibility } from './types'

/** 权限动作上下文（脚本可用） */
export type PermissionActionContext = {
  modelPermission?: ModelPermission
  row?: DataRow | null
}

/** 字段渲染状态（脚本可用） */
export type FieldRenderState = {
  field: string
  visibility: FieldVisibility
  readable: boolean
  editable: boolean
  displayValue: string | undefined
  shouldRender: boolean
}
