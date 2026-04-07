<script lang="ts">
/**
 * @skill-description 部门选择器字段，基于实体选择器预设工厂（createPickerPreset），弹窗选择部门。
 */
import { createPickerPreset } from '../createPickerPreset'

export default createPickerPreset({
  entityName: '部门',
  placeholder: '请选择部门',
  buttonText: '选部门',
  readonlyButtonText: '查看部门',
})
</script>