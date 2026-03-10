/**
 * Renderer 组件导出 + SPARK 注册
 *
 * 容器组件 type 映射（JSON 配置驱动）：
 *   r-table  → RendererTable
 *   r-form   → RendererForm
 *   r-detail → RendererDetail
 *   r-tree   → RendererTree
 *   r-list   → RendererList
 *   r-tabs   → RendererTabs
 *   r-collapse → RendererCollapse
 *   r-dialog → RendererDialog
 *   r-drawer → RendererDrawer
 *   r-steps  → RendererSteps
 *   r-section / r-block → RendererSection
 *
 * 字段组件 type 映射（SPARK 与 Vue 全局保持一致）：
 *   r-text   → FieldText
 *   r-textarea → FieldTextarea
 *   r-html-editor → FieldHtmlEditor
 *   r-number → FieldNumber
 *   r-date   → FieldDate
 *   r-select → FieldSelect
 *   r-multi-select → FieldMultiSelect
 *   r-radio  → FieldRadio
 *   r-checkbox → FieldCheckbox
 *   r-checkbox-group → FieldCheckboxGroup
 *   r-switch → FieldSwitch
 *   r-slider → FieldSlider
 *   r-rate   → FieldRate
 *   r-color  → FieldColor
 *   r-icon   → FieldIcon
 *   r-image  → FieldImage
 *   r-file-path → FieldFilePath
 *   r-file-browser → FieldFileBrowser
 *   r-upload → FieldUpload
 *   r-entity-picker → FieldEntityPicker
 *   r-user-picker → FieldUserPicker
 *   r-dept-picker → FieldDeptPicker
 *   r-product-picker → FieldProductPicker
 *   r-cascader → FieldCascader
 *   r-tree-select → FieldTreeSelect
 *   r-transfer → FieldTransfer
 *   r-column-group → FieldColumnGroup
 */
import { Spark } from '@spark-view/spark-component'
import type { GlobModules } from '@spark-view/spark-component'

// 容器组件
export { default as RendererTable } from './renderer-containers/RendererTable.vue'
export { default as RendererForm } from './renderer-containers/RendererForm.vue'
export { default as RendererDetail } from './renderer-containers/RendererDetail.vue'
export { default as RendererTree } from './renderer-containers/RendererTree.vue'
export { default as RendererList } from './renderer-containers/RendererList.vue'
export { default as RendererTabs } from './renderer-containers/RendererTabs.vue'
export { default as RendererCollapse } from './renderer-containers/RendererCollapse.vue'
export { default as RendererDialog } from './renderer-containers/RendererDialog.vue'
export { default as RendererDrawer } from './renderer-containers/RendererDrawer.vue'
export { default as RendererSteps } from './renderer-containers/RendererSteps.vue'
export { default as RendererSection } from './renderer-containers/RendererSection.vue'

// 字段组件
import FieldTextComp from './renderer-fields/FieldText.vue'
import FieldTextareaComp from './renderer-fields/FieldTextarea.vue'
import FieldHtmlEditorComp from './renderer-fields/FieldHtmlEditor.vue'
import FieldNumberComp from './renderer-fields/FieldNumber.vue'
import FieldDateComp from './renderer-fields/FieldDate.vue'
import FieldSelectComp from './renderer-fields/FieldSelect.vue'
import FieldMultiSelectComp from './renderer-fields/FieldMultiSelect.vue'
import FieldRadioComp from './renderer-fields/FieldRadio.vue'
import FieldCheckboxComp from './renderer-fields/FieldCheckbox.vue'
import FieldCheckboxGroupComp from './renderer-fields/FieldCheckboxGroup.vue'
import FieldSwitchComp from './renderer-fields/FieldSwitch.vue'
import FieldSliderComp from './renderer-fields/FieldSlider.vue'
import FieldRateComp from './renderer-fields/FieldRate.vue'
import FieldColorComp from './renderer-fields/FieldColor.vue'
import FieldIconComp from './renderer-fields/FieldIcon.vue'
import FieldImageComp from './renderer-fields/FieldImage.vue'
import FieldFilePathComp from './renderer-fields/FieldFilePath.vue'
import FieldFileBrowserComp from './renderer-fields/FieldFileBrowser.vue'
import FieldUploadComp from './renderer-fields/FieldUpload.vue'
import FieldEntityPickerComp from './renderer-fields/FieldEntityPicker.vue'
import FieldUserPickerComp from './renderer-fields/FieldUserPicker.vue'
import FieldDeptPickerComp from './renderer-fields/FieldDeptPicker.vue'
import FieldProductPickerComp from './renderer-fields/FieldProductPicker.vue'
import FieldCascaderComp from './renderer-fields/FieldCascader.vue'
import FieldTreeSelectComp from './renderer-fields/FieldTreeSelect.vue'
import FieldTransferComp from './renderer-fields/FieldTransfer.vue'
import FieldColumnGroupComp from './renderer-fields/FieldColumnGroup.vue'
export { FieldTextComp as FieldText }
export { FieldTextareaComp as FieldTextarea }
export { FieldHtmlEditorComp as FieldHtmlEditor }
export { FieldNumberComp as FieldNumber }
export { FieldDateComp as FieldDate }
export { FieldSelectComp as FieldSelect }
export { FieldMultiSelectComp as FieldMultiSelect }
export { FieldRadioComp as FieldRadio }
export { FieldCheckboxComp as FieldCheckbox }
export { FieldCheckboxGroupComp as FieldCheckboxGroup }
export { FieldSwitchComp as FieldSwitch }
export { FieldSliderComp as FieldSlider }
export { FieldRateComp as FieldRate }
export { FieldColorComp as FieldColor }
export { FieldIconComp as FieldIcon }
export { FieldImageComp as FieldImage }
export { FieldFilePathComp as FieldFilePath }
export { FieldFileBrowserComp as FieldFileBrowser }
export { FieldUploadComp as FieldUpload }
export { FieldEntityPickerComp as FieldEntityPicker }
export { FieldUserPickerComp as FieldUserPicker }
export { FieldDeptPickerComp as FieldDeptPicker }
export { FieldProductPickerComp as FieldProductPicker }
export { FieldCascaderComp as FieldCascader }
export { FieldTreeSelectComp as FieldTreeSelect }
export { FieldTransferComp as FieldTransfer }
export { FieldColumnGroupComp as FieldColumnGroup }

// ── SPARK 注册 ──

// 容器组件：懒加载（体积大，不一定全部使用）
const containerReg = Spark.createRegister(
  import.meta.glob('./renderer-containers/*.vue') as GlobModules
)
containerReg.registerAll({
  'r-table':  './renderer-containers/RendererTable.vue',
  'r-form':   './renderer-containers/RendererForm.vue',
  'r-detail': './renderer-containers/RendererDetail.vue',
  'r-tree':   './renderer-containers/RendererTree.vue',
  'r-list':   './renderer-containers/RendererList.vue',
  'r-tabs':   './renderer-containers/RendererTabs.vue',
  'r-collapse': './renderer-containers/RendererCollapse.vue',
  'r-dialog': './renderer-containers/RendererDialog.vue',
  'r-drawer': './renderer-containers/RendererDrawer.vue',
  'r-steps': './renderer-containers/RendererSteps.vue',
  'r-section': './renderer-containers/RendererSection.vue',
  'r-block': './renderer-containers/RendererSection.vue',
})

// 字段组件：同步注册（体积小，且 el-table 要求 el-table-column 同步就绪）
// 避免 defineAsyncComponent 导致 el-table 初次渲染时找不到 el-table-column
Spark.register('r-text', FieldTextComp)
Spark.register('r-textarea', FieldTextareaComp)
Spark.register('r-html-editor', FieldHtmlEditorComp)
Spark.register('r-number', FieldNumberComp)
Spark.register('r-date', FieldDateComp)
Spark.register('r-select', FieldSelectComp)
Spark.register('r-multi-select', FieldMultiSelectComp)
Spark.register('r-radio', FieldRadioComp)
Spark.register('r-checkbox', FieldCheckboxComp)
Spark.register('r-checkbox-group', FieldCheckboxGroupComp)
Spark.register('r-switch', FieldSwitchComp)
Spark.register('r-slider', FieldSliderComp)
Spark.register('r-rate', FieldRateComp)
Spark.register('r-color', FieldColorComp)
Spark.register('r-icon', FieldIconComp)
Spark.register('r-image', FieldImageComp)
Spark.register('r-file-path', FieldFilePathComp)
Spark.register('r-file-browser', FieldFileBrowserComp)
Spark.register('r-upload', FieldUploadComp)
Spark.register('r-entity-picker', FieldEntityPickerComp)
Spark.register('r-user-picker', FieldUserPickerComp)
Spark.register('r-dept-picker', FieldDeptPickerComp)
Spark.register('r-product-picker', FieldProductPickerComp)
Spark.register('r-cascader', FieldCascaderComp)
Spark.register('r-tree-select', FieldTreeSelectComp)
Spark.register('r-transfer', FieldTransferComp)
Spark.register('r-column-group', FieldColumnGroupComp)
