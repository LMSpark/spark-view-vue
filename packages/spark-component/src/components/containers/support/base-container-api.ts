/**
 * 容器组件公共 API 基类
 *
 * Table / Form / Detail / List 四大容器共享的 CRUD + 当前行方法签名。
 * Tree 的 CRUD 表面差异较大（appendNode / removeNode 等），不参与该基类。
 */
import type { CrudResult, IDataSource, IDataRow } from '@spark-view/spark-data'

/**
 * 数据容器 CRUD API（统一最小公约数）。
 *
 * 该接口用于抽取 Table/Form/Detail/List/Tree 的共有 CRUD 能力。
 */
export interface BaseCrudContainerApi {
  getDataSource(): IDataSource | null
  addRow(row: Partial<IDataRow>): Promise<IDataRow | CrudResult<IDataRow> | null>
  editRowById(id: string | number, patch: Partial<IDataRow>): Promise<boolean | CrudResult<IDataRow>>
  removeRow(id: string | number): Promise<boolean | CrudResult<boolean>>
}

/**
 * 表单/表格类容器 API（CRUD + 当前行 + 本地行操作）。
 */
export interface BaseContainerApi extends BaseCrudContainerApi {
  getCurrentRow(): IDataRow | null
  refresh(): Promise<void>
  appendRow(row: IDataRow): void
  updateRowById(id: string | number, patch: Partial<IDataRow>): boolean
  deleteRowById(id: string | number): boolean
  setCurrentRow(row: IDataRow | null): void
  setCurrentRowById(id: string | number | null): boolean
}

/**
 * 可见性容器 API（Dialog/Drawer 等）。
 */
export interface VisibilityContainerApi {
  open(): void
  close(): void
  isVisible(): boolean
  toggle(): void
}
