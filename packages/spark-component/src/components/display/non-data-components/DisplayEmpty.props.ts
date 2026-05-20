import type { SparkNodeProps } from '../../shared-types'

export interface REmptyProps extends SparkNodeProps {
  /** 空状态图片地址 */
    image?: string
    /** 图片尺寸（像素） */
    imageSize?: number
    /** 空状态描述文案 */
    description?: string
}
