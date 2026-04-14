import type { SparkFieldProps, SparkNodeProps } from '../../shared-types'

export interface RAvatarProps extends SparkNodeProps {
  /** 显式头像值 */
  value?: string
  /** 数据字段绑定键（通常映射到当前行 field） */
  field?: SparkFieldProps['field']
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
  icon?: string
}
