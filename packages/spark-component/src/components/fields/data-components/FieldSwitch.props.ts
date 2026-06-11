/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldSwitch.props
 * FieldSwitch 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RSwitchProps（共 1 个 symbol）。
 */
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../shared-types'

/** RSwitch Props 的属性契约。 */
export type RSwitchProps = SparkNodeProps & SparkFieldSemanticProps<boolean | null> & {
  /** 打开状态下展示的文本。 */
    activeText?: string
    /** 关闭状态下展示的文本。 */
    inactiveText?: string}
