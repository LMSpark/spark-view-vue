/**
 * 组件层共享类型——容器 & 字段均可引用。
 *
 * ValueRef<T> 是 Vue Ref<T> 的最小结构约束，
 * 用于纯 TS 文件中接受 ref-like 对象而无需 import vue。
 */
import type { SparkNodeChildren } from '../core/types.js'
import type { IDataSource } from '@spark-view/spark-data'
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
 * SPARK 组件共享基类（第一层）：所有 SPARK 组件 props 的统一起点。
 *
 * 说明：
 * - type 由渲染器路由与组件默认值共同决定
 * - id 对应 SparkNode.props.id 的运行时映射
 * - children 必须对齐 `SparkNode.children` 的真实运行时形态
 * - registry 分支会直接把 `node.children` 透传给目标组件
 * - `children` 允许包含文本子节点，因此不能错误收窄成 `SparkNode[]`
 * - 只消费结构子节点的容器，应在本地使用 `getSparkNodeChildren()` 再收窄
 */
export interface SparkNodeProps {
  type?: string
  id?: string
  children?: SparkNodeChildren
}

/**
 * 标题 + 内容文本语义（容器/展示组件复用）。
 */
export interface SparkTitleContentProps {
  /** 标题文本 */
  title?: string
  /** 主内容文本 */
  content?: string
}

/**
 * 字段级属性（第二层）：用于 field 语义组件。
 *
 * 继承 SparkNodeProps，字段组件自动获得 type / id / children。
 * 共享层不再通过泛型收窄 type；如某组件需要更具体的 type 字面量，
 * 应在该组件自己的 props 接口里显式声明，而不是让共享基类携带泛型。
 */
export interface SparkFieldProps extends SparkNodeProps {
  /** 字段绑定键（通常映射到 currentRow[field]） */
  field?: string
  /** 展示标签 */
  label?: string
  /** 只读状态 */
  readonly?: boolean
  /** 占位文案 */
  placeholder?: string
}

/**
 * 展示值绑定属性：display 组件常见的 value / field 双通道绑定模型。
 */
export interface SparkValueBindingProps<TValue = unknown> {
  /** 直接传入的展示值 */
  value?: TValue
  /** 数据字段绑定键（通常映射到当前行 field） */
  field?: string
}

export interface SparkOptionItem {
  label: string
  value: string | number | boolean
  disabled?: boolean
}

/**
 * 带选项字段属性（第三层）：在字段层上增加 options 语义，并支持对接数据线。
 */
export interface SparkOptionFieldProps
  extends SparkFieldProps {
  /** @internal 运行时数据线，由框架注入，不属于页面配置 */
  dataSource?: IDataSource
  options?: SparkOptionItem[]
  optionKey?: string
  labelKey?: string
  valueKey?: string
  /** 是否可清空 */
  clearable?: boolean
  /** 是否可搜索 */
  filterable?: boolean
  /** 是否多选 */
  multiple?: boolean
}

/**
 * 选项源配置（字段层通用）：用于 select/radio/cascader/tree-select 等组件。
 */
export interface SparkOptionSourceProps<TOption = unknown> {
  /** 可选项数据源 */
  options?: TOption[]
  /** 选项主键字段（用于稳定 key） */
  optionKey?: string
  /** 选项显示字段 */
  optionLabelField?: string
  /** 选项值字段 */
  optionValueField?: string
  /** 子级字段（树形选项） */
  optionChildrenField?: string
}

/**
 * 浮层行为配置（容器层通用）：popover/tooltip 等浮层组件共用。
 */
export interface SparkFloatingLayerProps {
  /** 浮层位置 */
  placement?: string
  /** 主题 */
  effect?: 'dark' | 'light'
  /** 偏移量 */
  offset?: number
  /** 显示延迟（毫秒） */
  showAfter?: number
  /** 隐藏延迟（毫秒） */
  hideAfter?: number
  /** 是否显示箭头 */
  showArrow?: boolean
  /** 浮层额外 class */
  popperClass?: string
}

/**
 * 表级模型属性（第五层）：DataView/DataKey 驱动容器复用。
 */
export interface SparkTableModelProps {
  /** @internal 运行时数据线，由框架注入，不属于页面配置 */
  dataSource?: IDataSource
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
export interface SparkRuntimeProps extends SparkNodeProps {}

export interface SparkRuntimeChildrenProps extends SparkNodeProps {}
