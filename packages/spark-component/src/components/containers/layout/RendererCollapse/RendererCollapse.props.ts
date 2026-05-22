import type { SparkNodeProps } from '../../../shared-types'
import type { RToolbarProps } from '../RendererToolbar.types'

// 这里不再为 JS 基础类型保留导出别名，折叠面板值直接使用原生联合类型。

export type RCollapseProps = SparkNodeProps & {
  /** 结构化工具栏 */
    toolbar?: RToolbarProps
    /** 当前展开的面板 */
    modelValue?: string | number | Array<string | number>
    /** 展开/折叠切换回调 */
    onChange?: (value: string | number | Array<string | number>) => void}
