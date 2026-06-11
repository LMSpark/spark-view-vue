<!--
@module @spark-appworks/spark-component:components/fields/data-components/FieldProductPicker
FieldProductPicker 模块，属于 SPARK component field-level/data-field。
组件目录: fields/data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<script lang="ts">
/**
 * @description 产品选择器字段，基于实体选择器预设工厂（createPickerPreset），弹窗选择产品。
 */
import { createPickerPreset } from '../createPickerPreset'

export default createPickerPreset({
  entityName: '商品',
  placeholder: '请选择商品',
  buttonText: '选商品',
  readonlyButtonText: '查看商品',
})
</script>