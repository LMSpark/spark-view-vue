/**
 * 页面脚本共享类型 — 依赖 spark-data 类型的数据结构
 *
 * 这些类型原是 spark-project-model 中 `script-context-types.ts` 的 InScript 类型，
 * 提取到 spark-data 以在正确层级复用。
 */

import type { DataRow, ModelPermission, FieldVisibility } from './types'

/** 权限动作上下文（脚本可用） */
export type PermissionActionContext = {
    /** model Permission 字段。 */
modelPermission?: ModelPermission
    /** 当前行数据。 */
row?: DataRow | null
}

/** 字段渲染状态（脚本可用） */
export type FieldRenderState = {
    /** field 字段。 */
field: string
    /** visibility 字段。 */
visibility: FieldVisibility
    /** readable 字段。 */
readable: boolean
    /** editable 字段。 */
editable: boolean
    /** display Value 字段。 */
displayValue: string | undefined
    /** 是否 should Render。 */
shouldRender: boolean
}
