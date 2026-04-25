import type { SparkDataDisplayProps, SparkNodeProps } from '../../shared-types'

export interface RAvatarProps extends SparkNodeProps, SparkDataDisplayProps<string> {
  /** 头像尺寸 */
  avatarSize?: number | 'large' | 'default' | 'small'
  /** 头像形状 */
  shape?: 'circle' | 'square'
  /** 图片地址 */
  src?: SparkText
  /** 响应式图像集合 */
  srcSet?: SparkText
  /** 图片替代文本 */
  alt?: SparkText
  /** 图片填充方式 */
  fit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down'
  /** 文本头像内容 */
  text?: SparkText
  /** 图标名称 */
  icon?: SparkText
}
