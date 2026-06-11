/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererSection/RendererSection.props
 * RendererSection 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RSectionProps（共 1 个 symbol）。
 */
import type { SparkGridLayoutProps, SparkNodeProps } from '../../../shared-types'
import type { RHeaderProps } from '../../zones/RendererHeader.types'

/** RSection Props 的属性契约。 */
export type RSectionProps = SparkNodeProps & SparkGridLayoutProps & {
  /** 结构化头部 */
    header?: RHeaderProps
    /** 分区标题 */
    title?: string
    /** 分区描述 */
    description?: string
    /** 是否可折叠 */
    collapsible?: boolean
    /** 默认折叠 */
    defaultCollapsed?: boolean
    /** 显示边框 */
    bordered?: boolean
    /** 使用卡片样式 */
    useCard?: boolean
    /** 卡片阴影模式 */
    cardShadow?: 'always' | 'hover' | 'never'
    /** 内容区 CSS 类名 */
    bodyClass?: string
    /** 展开文案 */
    expandText?: string
    /** 收起文案 */
    collapseText?: string
    /** 显示切换图标 */
    showToggleIcon?: boolean
    /** 展开图标文案 */
    expandIconText?: string
    /** 收起图标文案 */
    collapseIconText?: string}
