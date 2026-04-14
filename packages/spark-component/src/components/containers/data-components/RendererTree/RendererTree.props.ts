import type { DataView } from '@spark-view/spark-data'
import type {
  SparkNodeProps,
  SparkTableModelProps,
  SparkCrudEventProps,
} from '../../../shared-types'
import type { ToolbarNode } from '../../non-data-components/RendererToolbar.types'
import type { ActionsNode } from '../../support/RendererActionHost.types'
import type { EditorNode } from '../../RendererEditor.types'
import type { TreeEventHandler, TreeNodeActionHandler } from './zero-code'

/**
 * r-tree 组件公开属性接口。
 *
 * 命名规范：组件 type `r-tree` → 接口名 `RTreeProps`。
 */
export interface RTreeProps
  extends SparkNodeProps,
    SparkTableModelProps,
    SparkCrudEventProps {
  /** 显式收窄为树容器使用的 DataView 数据线。 */
  dataSource?: DataView
  /** 结构化工具栏 @componentRef r-toolbar */
  toolbar?: ToolbarNode
  /** 结构化节点动作 */
  actions?: ActionsNode
  /** 结构化编辑区 */
  editor?: EditorNode
  /** 节点主键字段名，默认取 treeConfig.idField */
  nodeKey?: string
  /** 当前选中节点 ID */
  currentKey?: string | number | null
  /** 初始化展开并定位到目标节点 ID */
  expandToKey?: string | number | null
  /** 初始化自动展开到指定层级（根节点为第 1 层） */
  expandLevel?: number
  /** 允许追加子节点（自动生成追加按钮） */
  allowAppend?: boolean
  /** 允许删除节点（自动生成删除按钮） */
  allowDelete?: boolean
  /** 节点点击回调 */
  onNodeClick?: TreeEventHandler
  /** 节点展开回调 */
  onNodeExpand?: TreeEventHandler
  /** 节点折叠回调 */
  onNodeCollapse?: TreeEventHandler
  /** 节点追加前回调 */
  onNodeAppend?: TreeNodeActionHandler
  /** 节点删除前回调 */
  onNodeDelete?: TreeNodeActionHandler
}
