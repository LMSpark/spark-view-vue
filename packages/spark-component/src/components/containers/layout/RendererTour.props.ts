/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererTour.props
 * RendererTour 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: TourStep, RTourProps（共 2 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** Tour Step 的语义模型。 */
export type TourStep = {
  /** CSS 选择器或元素引用（运行时解析） */
  target?: string | HTMLElement | null
  /** 步骤标题 */
  title?: string
  /** 步骤描述 */
  description?: string
  /** 弹出位置 */
  placement?: string
  /** 是否显示遮罩 */
  mask?: boolean
  /** 是否显示箭头 */
  showArrow?: boolean}

/** RTour Props 的属性契约。 */
export type RTourProps = SparkNodeProps & {
  /** 步骤配置列表 */
    steps?: TourStep[]
    /** 是否显示 */
    open?: boolean
    /** 弹出位置（默认） */
    placement?: string
    /** 是否显示箭头 */
    showArrow?: boolean
    /** 是否显示遮罩 */
    mask?: boolean
    /** 引导类型 */
    tourType?: 'default' | 'primary'
    /** ESC 关闭 */
    closeOnPressEscape?: boolean
    /** 滚动选项 */
    scrollIntoViewOptions?: boolean | ScrollIntoViewOptions}
