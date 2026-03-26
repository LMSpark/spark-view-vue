/**
 * 兼容入口。
 *
 * `renderer` 目录已按职责拆分为 `page` 与 `components` 两层。
 * 这里仅保留转发，避免旧深路径导入立即断裂。
 */

export {
  SparkPageRenderer,
  usePageDataSet,
} from '../page/index.js'

export type {
  UsePageDataSetOptions,
  UsePageDataSetReturn,
  PageContext,
  PageConfig,
  PageRendererProps,
} from '../page/index.js'

export {
  SparkComponentRenderer,
  RendererTable,
  RendererForm,
  RendererDetail,
  RendererTree,
  RendererList,
  RendererTabs,
  RendererCollapse,
  RendererDialog,
  RendererDrawer,
  RendererSteps,
  RendererSection,
  RendererToolbar,
  RendererFieldScope,
  RendererListItemScope,
  FieldText,
  FieldTextarea,
  FieldHtmlEditor,
  FieldNumber,
  FieldDate,
  FieldSelect,
  FieldMultiSelect,
  FieldRadio,
  FieldCheckbox,
  FieldCheckboxGroup,
  FieldSwitch,
  FieldSlider,
  FieldRate,
  FieldColor,
  FieldIcon,
  FieldImage,
  FieldFilePath,
  FieldFileBrowser,
  FieldUpload,
  FieldEntityPicker,
  FieldUserPicker,
  FieldDeptPicker,
  FieldProductPicker,
  FieldCascader,
  FieldTreeSelect,
  FieldTransfer,
  FieldContextRenderer,
  FieldColumnGroup,
  registerAllRenderers,
  useFieldPermission,
} from '../components/index.js'
