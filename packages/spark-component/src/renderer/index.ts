/**
 * SPARK 页面渲染引擎 - 渲染器模块入口
 *
 * 提供纯渲染层能力：
 * - SparkPageRenderer  SPARK 原生页面渲染组件（ComponentConfig 结构）
 * - SparkComponentRenderer  递归组件引擎
 * - 类型定义（BindRule、PageContext、PageConfig 等）
 *
 * 内部实现（不导出）：
 * - useCssScope — 由 SparkPageRenderer 组合调用
 */

// 组件（Vue SFC，由此文件统一导出，避免 index.ts 直接引用 .vue 文件）
// SparkPageRenderer: 页面级入口（远程加载 JSON + 状态管理）
// SparkComponentRenderer: 递归组件引擎（被 SparkPageRenderer 及业务组件调用）
export { default as SparkPageRenderer } from './SparkPageRenderer.vue'
export { default as SparkComponentRenderer } from './SparkComponentRenderer.vue'

// DataSet 初始化 Composable（迁移自 spark-data）
export { usePageDataSet } from './usePageDataSet'
export type { UsePageDataSetOptions, UsePageDataSetReturn } from './usePageDataSet'

// 类型
export type {
  BindRule,
  PageContext,
  PageConfig,
  PageRendererProps,
  RuleBindingOptions,
  SparkNode,
  SparkNodeMeta,
  SparkNodeDataConfig,
  SparkNodeLayoutConfig,
  SparkNodeFilterConfig,
  SparkNodeToolbarConfig,
  SparkNodeActionsConfig,
  SparkNodeSimpleActionsConfig,
  SparkNodeDualActionsConfig,
  SparkNodeStateConfig,
  SparkNodeBehaviorConfig,
} from './types'

// 渲染工具（供测试及高级用例）
export { bindDataToRules } from './binding/bindRules'
export { normalizeSparkNode, isSparkNode } from './binding/normalize-spark-node'

// ── 容器组件 ──────────────────────────────────────────────────────────────────
export { default as RendererTable } from './containers/RendererTable.vue'
export { default as RendererForm } from './containers/RendererForm.vue'
export { default as RendererDetail } from './containers/RendererDetail.vue'
export { default as RendererTree } from './containers/RendererTree.vue'
export { default as RendererList } from './containers/RendererList.vue'
export { default as RendererTabs } from './containers/RendererTabs.vue'
export { default as RendererCollapse } from './containers/RendererCollapse.vue'
export { default as RendererDialog } from './containers/RendererDialog.vue'
export { default as RendererDrawer } from './containers/RendererDrawer.vue'
export { default as RendererSteps } from './containers/RendererSteps.vue'
export { default as RendererSection } from './containers/RendererSection.vue'
export { default as RendererFieldScope } from './containers/RendererFieldScope.vue'
export { default as RendererListItemScope } from './containers/RendererListItemScope.vue'
export { default as RendererTreeNodeScope } from './containers/RendererTreeNodeScope.vue'

// ── 字段组件 ──────────────────────────────────────────────────────────────────
export { default as FieldText } from './fields/FieldText.vue'
export { default as FieldTextarea } from './fields/FieldTextarea.vue'
export { default as FieldHtmlEditor } from './fields/FieldHtmlEditor.vue'
export { default as FieldNumber } from './fields/FieldNumber.vue'
export { default as FieldDate } from './fields/FieldDate.vue'
export { default as FieldSelect } from './fields/FieldSelect.vue'
export { default as FieldMultiSelect } from './fields/FieldMultiSelect.vue'
export { default as FieldRadio } from './fields/FieldRadio.vue'
export { default as FieldCheckbox } from './fields/FieldCheckbox.vue'
export { default as FieldCheckboxGroup } from './fields/FieldCheckboxGroup.vue'
export { default as FieldSwitch } from './fields/FieldSwitch.vue'
export { default as FieldSlider } from './fields/FieldSlider.vue'
export { default as FieldRate } from './fields/FieldRate.vue'
export { default as FieldColor } from './fields/FieldColor.vue'
export { default as FieldIcon } from './fields/FieldIcon.vue'
export { default as FieldImage } from './fields/FieldImage.vue'
export { default as FieldFilePath } from './fields/FieldFilePath.vue'
export { default as FieldFileBrowser } from './fields/FieldFileBrowser.vue'
export { default as FieldUpload } from './fields/FieldUpload.vue'
export { default as FieldEntityPicker } from './fields/FieldEntityPicker.vue'
export { default as FieldUserPicker } from './fields/FieldUserPicker.vue'
export { default as FieldDeptPicker } from './fields/FieldDeptPicker.vue'
export { default as FieldProductPicker } from './fields/FieldProductPicker.vue'
export { default as FieldCascader } from './fields/FieldCascader.vue'
export { default as FieldTreeSelect } from './fields/FieldTreeSelect.vue'
export { default as FieldTransfer } from './fields/FieldTransfer.vue'
export { default as FieldColumnGroup } from './fields/FieldColumnGroup.vue'
export { default as FieldContextRenderer } from './fields/FieldContextRenderer.vue'

// ── 容器 Composable（供高级使用或扩展） ────────────────────────────────────────
export { useFormDetailContainer } from './containers/useFormDetailContainer'
export { useContainerDataSource } from './containers/useContainerDataSource'
export { useContainerContextData } from './containers/useContainerContextData'
export { useContainerGrid } from './containers/useContainerGrid'
export { useContainerInput } from './containers/useContainerInput'
export { useContainerSlots } from './containers/useContainerSlots'
export {
  createToolbarSlotScope,
  createRowActionSlotScope,
  createNodeActionSlotScope,
  createCurrentRowSlotScope,
} from './containers/useContainerSlotScopes'
export { useContainerToolbar } from './containers/useContainerToolbar'
export { useContainerActions } from './containers/useContainerActions'
export { useTableFilters } from './containers/useTableFilters'
export {
  isActionDisplayed,
  isModelActionAllowed,
  isRowActionAllowed,
} from './containers/action-permission'

// ── 字段 Composable ──
export { useFieldPermission } from './fields/useFieldPermission'
export { useFieldContext } from './fields/useFieldContext'
export { useFieldOptions } from './fields/useFieldOptions'
export { useFieldActionMode } from './fields/useFieldActionMode'
export { useFileFieldActions } from './fields/useFileFieldActions'
export { useSelectorFieldActions } from './fields/useSelectorFieldActions'
export { columnToFormRules, toElFormRules } from './fields/columnFormRules'
export { createPickerPreset } from './fields/createPickerPreset'

// ── 注册函数 ──
export { registerAllRenderers } from './register-renderers'
