/**
 * 一键注册所有内置 Renderer 容器 + 字段组件到 SPARK 注册表
 *
 * 容器组件以懒加载方式注册，字段组件同步注册（el-table 要求列组件同步就绪）。
 */
import { Spark } from '../spark.js'

// ── 字段组件（同步导入） ──
import FieldText from './fields/FieldText.vue'
import FieldTextarea from './fields/FieldTextarea.vue'
import FieldHtmlEditor from './fields/FieldHtmlEditor.vue'
import FieldNumber from './fields/FieldNumber.vue'
import FieldDate from './fields/FieldDate.vue'
import FieldSelect from './fields/FieldSelect.vue'
import FieldMultiSelect from './fields/FieldMultiSelect.vue'
import FieldRadio from './fields/FieldRadio.vue'
import FieldCheckbox from './fields/FieldCheckbox.vue'
import FieldCheckboxGroup from './fields/FieldCheckboxGroup.vue'
import FieldSwitch from './fields/FieldSwitch.vue'
import FieldSlider from './fields/FieldSlider.vue'
import FieldRate from './fields/FieldRate.vue'
import FieldColor from './fields/FieldColor.vue'
import FieldIcon from './fields/FieldIcon.vue'
import FieldImage from './fields/FieldImage.vue'
import FieldFilePath from './fields/FieldFilePath.vue'
import FieldFileBrowser from './fields/FieldFileBrowser.vue'
import FieldUpload from './fields/FieldUpload.vue'
import FieldEntityPicker from './fields/FieldEntityPicker.vue'
import FieldUserPicker from './fields/FieldUserPicker.vue'
import FieldDeptPicker from './fields/FieldDeptPicker.vue'
import FieldProductPicker from './fields/FieldProductPicker.vue'
import FieldCascader from './fields/FieldCascader.vue'
import FieldTreeSelect from './fields/FieldTreeSelect.vue'
import FieldTransfer from './fields/FieldTransfer.vue'
import FieldColumnGroup from './fields/FieldColumnGroup.vue'

export function registerAllRenderers(): void {
  // ── 容器组件：懒加载（体积大，按需加载） ──
  Spark.register('r-table', () => import('./containers/RendererTable.vue'))
  Spark.register('r-form', () => import('./containers/RendererForm.vue'))
  Spark.register('r-detail', () => import('./containers/RendererDetail.vue'))
  Spark.register('r-tree', () => import('./containers/RendererTree.vue'))
  Spark.register('r-list', () => import('./containers/RendererList.vue'))
  Spark.register('r-tabs', () => import('./containers/RendererTabs.vue'))
  Spark.register('r-collapse', () => import('./containers/RendererCollapse.vue'))
  Spark.register('r-dialog', () => import('./containers/RendererDialog.vue'))
  Spark.register('r-drawer', () => import('./containers/RendererDrawer.vue'))
  Spark.register('r-steps', () => import('./containers/RendererSteps.vue'))
  Spark.register('r-section', () => import('./containers/RendererSection.vue'))
  Spark.register('r-block', () => import('./containers/RendererSection.vue'))

  // ── 字段组件：同步注册（el-table 要求列组件同步就绪） ──
  Spark.register('r-text', FieldText)
  Spark.register('r-textarea', FieldTextarea)
  Spark.register('r-html-editor', FieldHtmlEditor)
  Spark.register('r-number', FieldNumber)
  Spark.register('r-date', FieldDate)
  Spark.register('r-select', FieldSelect)
  Spark.register('r-multi-select', FieldMultiSelect)
  Spark.register('r-radio', FieldRadio)
  Spark.register('r-checkbox', FieldCheckbox)
  Spark.register('r-checkbox-group', FieldCheckboxGroup)
  Spark.register('r-switch', FieldSwitch)
  Spark.register('r-slider', FieldSlider)
  Spark.register('r-rate', FieldRate)
  Spark.register('r-color', FieldColor)
  Spark.register('r-icon', FieldIcon)
  Spark.register('r-image', FieldImage)
  Spark.register('r-file-path', FieldFilePath)
  Spark.register('r-file-browser', FieldFileBrowser)
  Spark.register('r-upload', FieldUpload)
  Spark.register('r-entity-picker', FieldEntityPicker)
  Spark.register('r-user-picker', FieldUserPicker)
  Spark.register('r-dept-picker', FieldDeptPicker)
  Spark.register('r-product-picker', FieldProductPicker)
  Spark.register('r-cascader', FieldCascader)
  Spark.register('r-tree-select', FieldTreeSelect)
  Spark.register('r-transfer', FieldTransfer)
  Spark.register('r-column-group', FieldColumnGroup)
}
