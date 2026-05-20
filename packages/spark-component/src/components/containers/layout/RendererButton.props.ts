import type { SparkNodeProps } from '../../shared-types'
import type { BuiltinActionName } from '../../../page/actions'

export type RButtonProps = SparkNodeProps & {
  /**
   * CRUD 动作名（如 'refresh', 'delete-row'），由宿主能力决定是否接管执行。
   * @enumValue append-row 新增行：向当前数据视图追加一行。适合普通新增按钮；可配 appendPayload、inheritFields 或 prompt。
   * @enumValue prompt-append 弹窗新增：先弹出输入框，再追加新行。适合只填写一个关键字段的快速新增。
   * @enumValue prompt-edit 弹窗编辑：先弹出输入框，再更新目标行字段。适合行内或当前行的单字段快速编辑。
   * @enumValue submit-current-form 保存当前表单：提交当前表单容器的数据，通常用于表单页保存按钮。
   * @enumValue clear-rows 清空行：清空目标数据视图的全部本地行数据；这是危险操作，通常使用 danger 按钮样式。
   * @enumValue move-row 移动当前作用域行：移动行内按钮所在的 scope row，常用于树表或可排序数据。
   * @enumValue move-current 移动 currentRow：移动数据视图当前选中的 currentRow，常用于外部工具栏按钮。
   * @enumValue refresh 刷新数据：重新加载目标数据视图的数据。适合工具栏刷新按钮。
   * @enumValue delete-row 删除当前作用域行：删除行内按钮所在的 scope row。适合表格操作列里的删除按钮。
   * @enumValue delete-current 删除 currentRow：删除数据视图当前选中的 currentRow。适合详情页或外部工具栏按钮。
   * @enumValue delete-selected 批量删除选中行：删除 selectedRows 中的所有行。仅在表格启用 selection 多选列时使用。
   * @enumValue patch-row 更新当前作用域行：更新行内按钮所在的 scope row，可配 patch 或 field/value。
   * @enumValue patch-current 更新 currentRow：更新数据视图当前选中的 currentRow，适合详情页或工具栏按钮。
   * @enumValue patch-selected 批量更新选中行：批量更新 selectedRows 中的所有行。仅在表格启用 selection 多选列时使用。
   * @enumValue message-row 查看当前作用域行：展示行内按钮所在 scope row 的字段信息，不修改数据。
   * @enumValue message-current 查看 currentRow：展示数据视图当前选中 currentRow 的字段信息，不修改数据。
   */
  action?: BuiltinActionName
  /** 样式模板名（如 'primary', 'toolbar-danger', 'icon-add'） */
  template?: SparkText
  /** 按钮文本 */
  label?: SparkText
  /** 按钮类型 */
  buttonType?: SparkText
  /** 按钮尺寸 */
  buttonSize?: SparkText
  /** 是否朴素按钮 */
  plain?: boolean
  /** 是否文本按钮 */
  text?: boolean
  /** 文本按钮是否显示背景 */
  bg?: boolean
  /** 是否链接风格 */
  link?: boolean
  /** 是否圆角 */
  round?: boolean
  /** 是否圆形按钮 */
  circle?: boolean
  /** 是否加载中 */
  loading?: boolean
  /** 图标名称 */
  icon?: SparkText
  /** 中文按钮文案是否自动插空格 */
  autoInsertSpace?: boolean
  /** 自定义颜色 */
  color?: SparkText
  /** 深色主题 */
  dark?: boolean
}
