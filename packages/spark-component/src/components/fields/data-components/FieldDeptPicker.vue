<!--
@module @spark-appworks/spark-component:components/fields/data-components/FieldDeptPicker
FieldDeptPicker 模块，属于 SPARK component field-level/data-field。
组件目录: fields/data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<script lang="ts">
/**
 * @description 部门选择器字段，基于实体选择器预设工厂（createPickerPreset），弹窗选择部门。
 */
import { createPickerPreset } from '../createPickerPreset'

export default createPickerPreset({
  entityName: '部门',
  placeholder: '请选择部门',
  buttonText: '选部门',
  readonlyButtonText: '查看部门',
})
</script>