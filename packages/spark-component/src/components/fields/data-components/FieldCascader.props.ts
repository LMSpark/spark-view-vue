import type { SparkHierarchicalOptionFieldProps, SparkNodeProps } from '../../shared-types'

export interface CascaderPath extends Array<string | number | boolean> {}
export type CascaderValue = CascaderPath | CascaderPath[]

export interface RCascaderProps extends SparkNodeProps, SparkHierarchicalOptionFieldProps<CascaderValue> {
  /** 选中结果是否保留完整路径。 */
    emitPath?: boolean
}
