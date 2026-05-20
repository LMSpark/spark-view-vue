import type { SparkDataDisplayProps, SparkNodeProps } from '../../shared-types'

export interface RDisplayImageProps extends SparkNodeProps, SparkDataDisplayProps<string> {
  /** 图片 URL（静态传入）。 */
    src?: string
    /** 图片适应模式 */
    fit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down'
    /** 替代文本 */
    alt?: string
    /** 是否懒加载 */
    lazy?: boolean
    /** 预览图列表（静态传入） */
    previewSrcList?: string[]
    /** 预览图字段名（从当前行读取数组） */
    previewField?: string
    /** 初始预览索引 */
    initialIndex?: number
    /** 预览层级 */
    zIndex?: number
    /** 点击蒙层关闭预览 */
    hideOnClickModal?: boolean
    /** 预览传送至 body */
    previewTeleported?: boolean
    /** ESC 关闭预览 */
    closeOnPressEscape?: boolean
    /** 图片宽度 */
    width?: string | number
    /** 图片高度 */
    height?: string | number
}
