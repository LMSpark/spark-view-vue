import type { SparkChildrenProps } from '../../shared-types'

export interface TourStep {
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
  showArrow?: boolean
}

export interface RTourProps extends SparkChildrenProps<'r-tour'> {
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
  scrollIntoViewOptions?: boolean | ScrollIntoViewOptions
}
