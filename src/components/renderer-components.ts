/**
 * Renderer 组件导出 + SPARK 注册
 *
 * 组件源码已迁移到 @spark-view/spark-component 包。
 * 本文件保留为兼容桥接：
 *   - 调用 registerAllRenderers() 完成 SPARK 注册
 *   - 从包级 re-export 全部组件（向后兼容现有消费者）
 */
import { registerAllRenderers } from '@spark-view/spark-component'

// 执行 SPARK 注册（side-effect）
registerAllRenderers()

// ── 容器组件 re-export ──
export {
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
} from '@spark-view/spark-component'

// ── 字段组件 re-export ──
export {
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
  FieldColumnGroup,
} from '@spark-view/spark-component'

export { default as ModuleContextBadge } from './ModuleContextBadge.vue'
