import type { SparkNodeProps, SparkOptionFieldProps } from '../../shared-types'

export type RIconProps = SparkNodeProps & SparkOptionFieldProps<string> & {
  /** 图标名称解析时使用的 class 前缀。 */
  classPrefix?: SparkText
}
