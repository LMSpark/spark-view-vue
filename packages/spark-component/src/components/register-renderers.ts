/**
 * 一键注册所有内置 Renderer 容器 + 字段组件到 SPARK 注册表
 *
 * 容器组件当前也采用同步注册。
 * 它们已经通过公共入口被同步导出；若这里继续使用动态 import，
 * 只会触发 Vite 的 mixed static/dynamic import 告警，而没有真实懒加载收益。
 */
import { Spark } from '../spark.js'

// ── 容器组件（同步导入） ──
import RendererTable from './containers/RendererTable.vue'
import RendererForm from './containers/RendererForm.vue'
import RendererDetail from './containers/RendererDetail.vue'
import RendererTree from './containers/RendererTree.vue'
import RendererList from './containers/RendererList.vue'
import RendererTabs from './containers/RendererTabs.vue'
import RendererCollapse from './containers/RendererCollapse.vue'
import RendererDialog from './containers/RendererDialog.vue'
import RendererDrawer from './containers/RendererDrawer.vue'
import RendererSteps from './containers/RendererSteps.vue'
import RendererSection from './containers/RendererSection.vue'
import RendererToolbar from './containers/RendererToolbar.vue'

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
import FieldContextRenderer from './fields/FieldContextRenderer.vue'

export function registerAllRenderers(): void {
  // ── 容器组件：同步注册（与公共静态导出保持一致） ──
  Spark.register('r-table', RendererTable)
  Spark.register('r-form', RendererForm)
  Spark.register('r-detail', RendererDetail)
  Spark.register('r-tree', RendererTree)
  Spark.register('r-list', RendererList)
  Spark.register('r-tabs', RendererTabs)
  Spark.register('r-collapse', RendererCollapse)
  Spark.register('r-dialog', RendererDialog)
  Spark.register('r-drawer', RendererDrawer)
  Spark.register('r-steps', RendererSteps)
  Spark.register('r-section', RendererSection)
  Spark.register('r-block', RendererSection)
  Spark.register('r-toolbar', RendererToolbar)
  Spark.register('r-menu', RendererToolbar)

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
  Spark.register('r-column-group', FieldContextRenderer)
}
