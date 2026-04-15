import type { SparkNodeProps, SparkUploadFieldProps } from '../../shared-types'

export interface RUploadProps extends SparkNodeProps, SparkUploadFieldProps {
  /** 选择文件后是否立即开始上传。 */
  autoUpload?: boolean
  /** 是否展示已选择文件列表。 */
  showFileList?: boolean
  /** 允许上传的文件数量上限。 */
  limit?: number
  /** 上传列表展示样式。 */
  listType?: 'text' | 'picture' | 'picture-card'
}
