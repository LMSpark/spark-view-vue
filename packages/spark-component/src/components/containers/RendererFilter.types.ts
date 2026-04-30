import type { IDataRow } from '@spark-view/spark-data'
import type { SparkNode } from '../internal'
import type { SparkNodeProps } from '../shared-types'

/**
 * `r-filter` / `RendererFilter` 完整属性定义。
 *
 * 同时作为：
 * - Vue `defineProps<RendererFilterProps>()` 的类型（组件内部消费）；
 * - `r-table` 等容器 `filter?: RendererFilterProps` 结构化配置类型（父容器读取布局字段）。
 *
 * ### 属性分组
 * - **配置字段**（`class` / `dataKey` / `collapsible` / 尺寸类）：由父容器从 pagedata.json 读取，
 *   RendererFilter.vue 本身只消费布局尺寸字段，`class` 由父容器直接注入自身模板，不透传给本组件。
 * - **内部桥接字段**（`model` / `activeCount` / `collapsed` / `*Action`）：
 *   由父容器在模板渲染时直接注入，不来自 pagedata.json 或 script.js。
 */
export interface RendererFilterProps extends SparkNodeProps {
  /** 组件类型固定为 `r-filter`。 */
  type?: 'r-filter'
  /** 节点标识。 */
  id?: string
  /** 默认筛选项节点列表（首选入口）。 */
  children?: SparkNode[]

  // ── 配置字段（pagedata.json 可设置） ─────────────────────────────────────
  /**
   * 筛选区附加 CSS class。
   * @remarks 由父容器（r-table 等）直接读取并应用到自身包裹层（如 `:filter-class`），
   * RendererFilter.vue 本身不消费此字段。
   */
  class?: string
  /**
   * 数据绑定键（datakey）。
   * @remarks 由父容器用于解析筛选区绑定的数据上下文，RendererFilter.vue 本身不直接消费。
   */
  dataKey?: string
  /** 是否允许折叠。 */
  collapsible?: boolean
  /** 初始是否折叠。 */
  defaultCollapsed?: boolean
  /** 自适应最小宽度。 */
  autoFitMinWidth?: string
  /** 每个筛选项占据的栅格列数。 */
  itemSpan?: number
  /** 操作区占据的栅格列数，默认跟随 itemSpan。 */
  actionSpan?: number
  /** CSS Grid 列数。 */
  gridColumns?: number
  /** 栅格间距。 */
  gridGap?: number | string
  /** 栅格行高。 */
  gridAutoRows?: string

  // ── 内部桥接字段（由父容器模板注入，不来自 pagedata.json / script.js） ──
  /**
   * 筛选条件模型对象。
   * @internal
   */
  model?: IDataRow
  /**
   * 当前激活的筛选条件数。
   * @internal
   */
  activeCount?: number
  /**
   * 是否处于折叠状态（运行时受控）。
   * @internal
   */
  collapsed?: boolean
  /**
   * 搜索动作回调。
   * @internal
   */
  searchAction?: () => Promise<void> | void
  /**
   * 重置动作回调。
   * @internal
   */
  resetAction?: () => Promise<void> | void
  /**
   * 折叠切换动作回调。
   * @internal
   */
  toggleCollapsedAction?: () => void
}

