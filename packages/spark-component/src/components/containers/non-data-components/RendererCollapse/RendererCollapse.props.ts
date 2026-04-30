import type { SparkNodeProps } from '../../../shared-types'

export type CollapseValue = string | number | Array<string | number>

export interface RCollapseProps extends SparkNodeProps {
  /** 当前展开的面板 */
  value?: CollapseValue
  /** 展开/折叠切换回调 */
  onChange?: (value: CollapseValue) => void
}
