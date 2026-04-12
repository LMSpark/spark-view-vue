<script lang="ts">
/**
 * @skill r-user-picker
 * @description 用户选择器字段，基于实体选择器预设工厂（createPickerPreset），弹窗选择用户。
 */
import { createPickerPreset } from '../createPickerPreset'

export default createPickerPreset({
  entityName: '人员',
  placeholder: '请选择人员',
  buttonText: '选人',
  readonlyButtonText: '查看人员',
})
</script>