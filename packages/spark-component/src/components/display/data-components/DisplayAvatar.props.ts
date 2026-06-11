/**
 * @module @spark-appworks/spark-component:components/display/data-components/DisplayAvatar.props
 * DisplayAvatar 模块，属于 SPARK component display/data-display。
 * 组件目录: display/data-components。
 * 导出 ClassModel symbol: RAvatarProps（共 1 个 symbol）。
 */
import type { SparkDataDisplayProps, SparkNodeProps } from '../../shared-types'

/** RAvatar Props 的属性契约。 */
export type RAvatarProps = SparkNodeProps & SparkDataDisplayProps<string> & {
  /** 头像尺寸 */
    avatarSize?: number | 'large' | 'default' | 'small'
    /** 头像形状 */
    shape?: 'circle' | 'square'
    /** 图片地址 */
    src?: string
    /** 响应式图像集合 */
    srcSet?: string
    /** 图片替代文本 */
    alt?: string
    /** 图片填充方式 */
    fit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down'
    /** 文本头像内容 */
    text?: string
    /** 图标名称 */
    icon?: string}
