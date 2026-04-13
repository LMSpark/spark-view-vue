/**
 * 组件层共享类型——容器 & 字段均可引用。
 *
 * ValueRef<T> 是 Vue Ref<T> 的最小结构约束，
 * 用于纯 TS 文件中接受 ref-like 对象而无需 import vue。
 */
import type { SparkNode } from '../core/types.js'
import type { IDataRow, IDataSource } from '@spark-view/spark-data'
import type {
  AddRowHandler,
  EditRowHandler,
  RemoveRowHandler,
  RowClickHandler,
  RowSelectionHandler,
  CurrentRowChangeHandler,
} from './containers/support'

export interface ValueRef<T> {
  value: T
}

/**
 * 组件基础属性（第一层）：所有组件共享。
 *
 * 说明：
 * - type 由渲染器路由与组件默认值共同决定
 * - id 对应 SparkNode.props.id 的运行时映射
 */
export interface SparkComponentBaseProps<TType extends string = string> {
  type?: TType
  id?: string
}

/**
 * 含结构子节点的基础属性（第一层扩展）。
 */
export interface SparkChildrenProps<TType extends string = string> extends SparkComponentBaseProps<TType> {
  children?: SparkNode[]
}

/**
 * 字段级属性（第二层）：用于 field 语义组件。
 *
 * 继承 SparkComponentBaseProps，字段组件自动获得 type / id。
 */
export interface SparkFieldProps<TType extends string = string> extends SparkComponentBaseProps<TType> {
  /** 字段绑定键（通常映射到 currentRow[field]） */
  field?: string
  /** 展示标签 */
  label?: string
  /** 只读状态 */
  readonly?: boolean
  /** 占位文案 */
  placeholder?: string
}

export interface SparkOptionItem {
  label: string
  value: string | number | boolean
  disabled?: boolean
}

/**
 * 带选项字段属性（第三层）：在字段层上增加 options 语义，并支持对接数据线。
 */
export interface SparkOptionFieldProps<TType extends string = string, TDataLine extends IDataSource = IDataSource>
  extends SparkFieldProps<TType>, SparkDataLineProps<TDataLine> {
  options?: SparkOptionItem[]
  optionKey?: string
  labelKey?: string
  valueKey?: string
}

/**
 * 行级实例属性（第四层）：行上下文组件复用。
 */
export interface SparkRowInstanceProps {
  row?: IDataRow
  rowIndex?: number
}

/**
 * 数据线属性（第五层基础）：容器可直接接入已解析的数据线。
 */
export interface SparkDataLineProps<TDataLine extends IDataSource = IDataSource> {
  dataSource?: TDataLine
}

/**
 * 表级模型属性（第五层）：DataView/DataKey 驱动容器复用。
 */
export interface SparkTableModelProps<TDataLine extends IDataSource = IDataSource> extends SparkDataLineProps<TDataLine> {
  /** 数据绑定键，推荐格式 table@field 或 table@viewId@field */
  dataKey?: string
}

/**
 * 数据容器 CRUD 事件（统一命名层）。
 */
export interface SparkCrudEventProps {
  onAddRow?: AddRowHandler
  onEditRow?: EditRowHandler
  onRemoveRow?: RemoveRowHandler
}

/**
 * 行交互事件（统一命名层）。
 */
export interface SparkRowInteractionEventProps {
  onRowClick?: RowClickHandler
  onSelectionChange?: RowSelectionHandler
  onCurrentChange?: CurrentRowChangeHandler
}

/**
 * 可见性生命周期事件（统一命名层）。
 */
export interface SparkVisibilityEventProps {
  onOpen?: () => void
  onClose?: () => void
  onOpened?: () => void
  onClosed?: () => void
}

// Backward compatibility aliases
export interface SparkRuntimeProps<TType extends string = string> extends SparkComponentBaseProps<TType> {}

export interface SparkRuntimeChildrenProps<TType extends string = string> extends SparkChildrenProps<TType> {}
