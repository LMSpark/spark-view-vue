/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldUpload.props
 * FieldUpload 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RUploadProps（共 1 个 symbol）。
 */
import type { SparkNodeProps, SparkUploadFieldProps } from '../../shared-types'

/** RUpload Props 的属性契约。 */
export type RUploadProps = SparkNodeProps & SparkUploadFieldProps & {
  /** 选择文件后是否立即开始上传。 */
    autoUpload?: boolean
    /** 是否展示已选择文件列表。 */
    showFileList?: boolean
    /** 允许上传的文件数量上限。 */
    limit?: number
    /** 上传列表展示样式。 */
    listType?: 'text' | 'picture' | 'picture-card'}
