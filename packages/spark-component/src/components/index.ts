/**
 * 组件层入口。
 *
 * 聚合所有可渲染组件、组件内部注册函数以及少量对外暴露的组件级 composable。
 */

import { markSparkTemplateNodeComponent } from './support/SparkChild.shared.js'
import { createTemplateDsl } from './template/createTemplateDsl.js'
import RendererTable from './containers/data-components/RendererTable/index.js'

// ── 字段组件导入（用于 DSL 标记 + 别名导出）──────────────────────────────────
import BuiltinActionButton from './containers/BuiltinActionButton.vue'
import FieldText from './fields/data-components/FieldText.vue'
import FieldTextarea from './fields/data-components/FieldTextarea.vue'
import FieldHtmlEditor from './fields/data-components/FieldHtmlEditor.vue'
import FieldNumber from './fields/data-components/FieldNumber.vue'
import FieldDate from './fields/data-components/FieldDate.vue'
import FieldSelect from './fields/data-components/FieldSelect.vue'
import FieldMultiSelect from './fields/data-components/FieldMultiSelect.vue'
import FieldRadio from './fields/data-components/FieldRadio.vue'
import FieldCheckbox from './fields/data-components/FieldCheckbox.vue'
import FieldCheckboxGroup from './fields/data-components/FieldCheckboxGroup.vue'
import FieldSwitch from './fields/data-components/FieldSwitch.vue'
import FieldSlider from './fields/data-components/FieldSlider.vue'
import FieldRate from './fields/data-components/FieldRate.vue'
import FieldColor from './fields/data-components/FieldColor.vue'
import FieldIcon from './fields/data-components/FieldIcon.vue'
import FieldImage from './fields/data-components/FieldImage.vue'
import FieldFilePath from './fields/data-components/FieldFilePath.vue'
import FieldFileBrowser from './fields/data-components/FieldFileBrowser.vue'
import FieldUpload from './fields/data-components/FieldUpload.vue'
import FieldEntityPicker from './fields/data-components/FieldEntityPicker.vue'
import FieldUserPicker from './fields/data-components/FieldUserPicker.vue'
import FieldDeptPicker from './fields/data-components/FieldDeptPicker.vue'
import FieldProductPicker from './fields/data-components/FieldProductPicker.vue'
import FieldCascader from './fields/data-components/FieldCascader.vue'
import FieldTreeSelect from './fields/data-components/FieldTreeSelect.vue'
import FieldTransfer from './fields/data-components/FieldTransfer.vue'
import FieldContextRenderer from './fields/non-data-components/FieldContextRenderer.vue'
import FieldTreeNodeSummary from './fields/non-data-components/TreeNodeSummary.vue'

// ── DSL 标记：使组件可作为模板 DSL 子节点编译为 SparkNode ─────────────────────
markSparkTemplateNodeComponent(BuiltinActionButton, { nodeType: 'builtin-action' })
markSparkTemplateNodeComponent(FieldText, { nodeType: 'r-text' })
markSparkTemplateNodeComponent(FieldTextarea, { nodeType: 'r-textarea' })
markSparkTemplateNodeComponent(FieldHtmlEditor, { nodeType: 'r-html-editor' })
markSparkTemplateNodeComponent(FieldNumber, { nodeType: 'r-number' })
markSparkTemplateNodeComponent(FieldDate, { nodeType: 'r-date' })
markSparkTemplateNodeComponent(FieldSelect, { nodeType: 'r-select' })
markSparkTemplateNodeComponent(FieldMultiSelect, { nodeType: 'r-multi-select' })
markSparkTemplateNodeComponent(FieldRadio, { nodeType: 'r-radio' })
markSparkTemplateNodeComponent(FieldCheckbox, { nodeType: 'r-checkbox' })
markSparkTemplateNodeComponent(FieldCheckboxGroup, { nodeType: 'r-checkbox-group' })
markSparkTemplateNodeComponent(FieldSwitch, { nodeType: 'r-switch' })
markSparkTemplateNodeComponent(FieldSlider, { nodeType: 'r-slider' })
markSparkTemplateNodeComponent(FieldRate, { nodeType: 'r-rate' })
markSparkTemplateNodeComponent(FieldColor, { nodeType: 'r-color' })
markSparkTemplateNodeComponent(FieldIcon, { nodeType: 'r-icon' })
markSparkTemplateNodeComponent(FieldImage, { nodeType: 'r-image' })
markSparkTemplateNodeComponent(FieldFilePath, { nodeType: 'r-file-path' })
markSparkTemplateNodeComponent(FieldFileBrowser, { nodeType: 'r-file-browser' })
markSparkTemplateNodeComponent(FieldUpload, { nodeType: 'r-upload' })
markSparkTemplateNodeComponent(FieldEntityPicker, { nodeType: 'r-entity-picker' })
markSparkTemplateNodeComponent(FieldUserPicker, { nodeType: 'r-user-picker' })
markSparkTemplateNodeComponent(FieldDeptPicker, { nodeType: 'r-dept-picker' })
markSparkTemplateNodeComponent(FieldProductPicker, { nodeType: 'r-product-picker' })
markSparkTemplateNodeComponent(FieldCascader, { nodeType: 'r-cascader' })
markSparkTemplateNodeComponent(FieldTreeSelect, { nodeType: 'r-tree-select' })
markSparkTemplateNodeComponent(FieldTransfer, { nodeType: 'r-transfer' })
markSparkTemplateNodeComponent(FieldContextRenderer, { nodeType: 'r-column-group' })
markSparkTemplateNodeComponent(FieldTreeNodeSummary, { nodeType: 'r-tree-node-summary' })

// ── 支持组件 ──────────────────────────────────────────────────────────────────
export { default as SparkComponentRenderer } from './SparkComponentRenderer.vue'
export { default as SparkChild } from './support/SparkChild.js'
export { default as SparkChildrenBridge } from './support/SparkChildrenBridge.js'
export { default as SparkTableColumns } from './support/SparkTableColumns.js'
export { default as ElTableColumns } from './support/SparkTableColumns.js'

// ── 模板 DSL ──────────────────────────────────────────────────────────────────
export { createTemplateDsl }
export { default as RTable } from './template/RTable.js'
export {
  RForm, RDetail, RTree, RList,
  RTabs, RCollapse, RDialog, RDrawer, RSteps, RSection, RToolbar,
} from './template/dsl-components.js'

// ── DSL 字段别名（R-前缀快捷名）──────────────────────────────────────────────
// 这些导出面向模板 authoring，统一返回固定 nodeType 的 DSL 包装组件；
// 真实渲染组件仍通过 Field* / BuiltinActionButton 暴露。
export const ElButton = createTemplateDsl('builtin-action', 'SparkDslBuiltinActionButton')
export const RText = createTemplateDsl('r-text', 'RText')
export const RTextarea = createTemplateDsl('r-textarea', 'RTextarea')
export const RHtmlEditor = createTemplateDsl('r-html-editor', 'RHtmlEditor')
export const RNumber = createTemplateDsl('r-number', 'RNumber')
export const RDate = createTemplateDsl('r-date', 'RDate')
export const RSelect = createTemplateDsl('r-select', 'RSelect')
export const RMultiSelect = createTemplateDsl('r-multi-select', 'RMultiSelect')
export const RRadio = createTemplateDsl('r-radio', 'RRadio')
export const RCheckbox = createTemplateDsl('r-checkbox', 'RCheckbox')
export const RCheckboxGroup = createTemplateDsl('r-checkbox-group', 'RCheckboxGroup')
export const RSwitch = createTemplateDsl('r-switch', 'RSwitch')
export const RSlider = createTemplateDsl('r-slider', 'RSlider')
export const RRate = createTemplateDsl('r-rate', 'RRate')
export const RColor = createTemplateDsl('r-color', 'RColor')
export const RIcon = createTemplateDsl('r-icon', 'RIcon')
export const RImage = createTemplateDsl('r-image', 'RImage')
export const RFilePath = createTemplateDsl('r-file-path', 'RFilePath')
export const RFileBrowser = createTemplateDsl('r-file-browser', 'RFileBrowser')
export const RUpload = createTemplateDsl('r-upload', 'RUpload')
export const REntityPicker = createTemplateDsl('r-entity-picker', 'REntityPicker')
export const RUserPicker = createTemplateDsl('r-user-picker', 'RUserPicker')
export const RDeptPicker = createTemplateDsl('r-dept-picker', 'RDeptPicker')
export const RProductPicker = createTemplateDsl('r-product-picker', 'RProductPicker')
export const RCascader = createTemplateDsl('r-cascader', 'RCascader')
export const RTreeSelect = createTemplateDsl('r-tree-select', 'RTreeSelect')
export const RTransfer = createTemplateDsl('r-transfer', 'RTransfer')
export const RColumnGroup = createTemplateDsl('r-column-group', 'RColumnGroup')
export const RTreeNodeSummary = createTemplateDsl('r-tree-node-summary', 'RTreeNodeSummary')

// ── 容器 Renderer 组件 ───────────────────────────────────────────────────────
export { RendererTable }
export { default as RendererForm } from './containers/data-components/RendererForm/index.js'
export { default as RendererDetail } from './containers/data-components/RendererDetail/index.js'
export { default as RendererTree } from './containers/data-components/RendererTree/index.js'
export { default as RendererList } from './containers/data-components/RendererList/index.js'
export { default as RendererTabs } from './containers/non-data-components/RendererTabs/index.js'
export { default as RendererCollapse } from './containers/non-data-components/RendererCollapse/index.js'
export { default as RendererDialog } from './containers/non-data-components/RendererDialog/index.js'
export { default as RendererDrawer } from './containers/non-data-components/RendererDrawer/index.js'
export { default as RendererSteps } from './containers/non-data-components/RendererSteps/index.js'
export { default as RendererSection } from './containers/non-data-components/RendererSection/index.js'
export { default as RendererToolbar } from './containers/non-data-components/RendererToolbar.vue'
export { BuiltinActionButton }
export { default as RendererFieldScope } from './containers/data-components/RendererFieldScope.vue'
export { default as RendererListItemScope } from './containers/data-components/RendererListItemScope.vue'

// ── 字段组件 ──────────────────────────────────────────────────────────────────
export { FieldText }
export { FieldTextarea }
export { FieldHtmlEditor }
export { FieldNumber }
export { FieldDate }
export { FieldSelect }
export { FieldMultiSelect }
export { FieldRadio }
export { FieldCheckbox }
export { FieldCheckboxGroup }
export { FieldSwitch }
export { FieldSlider }
export { FieldRate }
export { FieldColor }
export { FieldIcon }
export { FieldImage }
export { FieldFilePath }
export { FieldFileBrowser }
export { FieldUpload }
export { FieldEntityPicker }
export { FieldUserPicker }
export { FieldDeptPicker }
export { FieldProductPicker }
export { FieldCascader }
export { FieldTreeSelect }
export { FieldTransfer }
export { FieldContextRenderer }
export { FieldContextRenderer as FieldColumnGroup }
export { FieldTreeNodeSummary }

// ── 注册 & composable ────────────────────────────────────────────────────────
export { registerAllRenderers } from './register-renderers.js'
export { useFieldPermission } from './fields/composables.js'
