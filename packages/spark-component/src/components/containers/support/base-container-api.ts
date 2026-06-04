/**
 * 容器组件公共 API 基类
 *
 * Table / Form / Detail / List 四大容器共享的 CRUD + 当前行方法签名。
 * Tree 的 CRUD 表面差异较大（appendNode / removeNode 等），不参与该基类。
 */
import type { CrudResult, DataView, DataRow } from '@spark-appworks/spark-data'

/**
 * 数据容器 CRUD API（统一最小公约数）。
 *
 * 该接口用于抽取 Table/Form/Detail/List/Tree 的共有 CRUD 能力。
 */
export type BaseCrudContainerApi = {
  getDataSource(): DataView | null
  addRow(row: Partial<DataRow>): Promise<DataRow | CrudResult<DataRow> | null>
  editRowById(id: string | number, patch: Partial<DataRow>): Promise<boolean | CrudResult<DataRow>>
  removeRow(id: string | number): Promise<boolean | CrudResult<boolean>>}

/**
 * 表单/表格类容器 API（CRUD + 当前行 + 本地行操作）。
 */
export type BaseContainerApi = BaseCrudContainerApi & {
  getCurrentRow(): DataRow | null
    refresh(): Promise<void>
    appendRow(row: DataRow): void
    updateRowById(id: string | number, patch: Partial<DataRow>): boolean
    deleteRowById(id: string | number): boolean
    setCurrentRow(row: DataRow | null): void
    setCurrentRowById(id: string | number | null): boolean}

/**
 * 可见性容器 API（Dialog/Drawer 等）。
 */
export type VisibilityContainerApi = {
  open(): void
  close(): void
  isVisible(): boolean
  toggle(): void}
