<script lang="ts">
/**
 * @skill r-product-picker
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