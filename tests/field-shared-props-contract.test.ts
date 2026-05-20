import { describe, expect, it } from 'vitest'
import type {
  SparkFieldSemanticProps,
  SparkFileFieldProps,
  SparkFilePickerFieldProps,
  SparkFileUploadActionProps,
  SparkHierarchicalSelectionProps,
  SparkMultilineRowsProps,
  SparkNumericBoundsProps,
  SparkNumericMaxProps,
  SparkOptionButtonStyleProps,
  SparkPrimaryActionTextProps,
  SparkRangeFilterProps,
  SparkReadonlyActionTextProps,
  SparkTemporalPickerProps,
} from '../packages/spark-component/src/components/shared-types'
import type { FieldPermissionProps } from '../packages/spark-component/src/components/fields/context/useFieldPermission'
import type { RCheckboxGroupProps } from '../packages/spark-component/src/components/fields/data-components/FieldCheckboxGroup.props'
import type { RCascaderProps } from '../packages/spark-component/src/components/fields/data-components/FieldCascader.props'
import type { RDateProps } from '../packages/spark-component/src/components/fields/data-components/FieldDate.props'
import type { REntityPickerProps } from '../packages/spark-component/src/components/fields/data-components/FieldEntityPicker.props'
import type { RFilePathProps } from '../packages/spark-component/src/components/fields/data-components/FieldFilePath.props'
import type { RHtmlEditorProps } from '../packages/spark-component/src/components/fields/data-components/FieldHtmlEditor.props'
import type { RMentionProps } from '../packages/spark-component/src/components/fields/data-components/FieldMention.props'
import type { RNumberProps } from '../packages/spark-component/src/components/fields/data-components/FieldNumber.props'
import type { RRadioProps } from '../packages/spark-component/src/components/fields/data-components/FieldRadio.props'
import type { RRateProps } from '../packages/spark-component/src/components/fields/data-components/FieldRate.props'
import type { RSliderProps } from '../packages/spark-component/src/components/fields/data-components/FieldSlider.props'
import type { RTextareaProps } from '../packages/spark-component/src/components/fields/data-components/FieldTextarea.props'
import type { RTreeSelectProps } from '../packages/spark-component/src/components/fields/data-components/FieldTreeSelect.props'
import type { RUploadProps } from '../packages/spark-component/src/components/fields/data-components/FieldUpload.props'

function assertExtends<TValue extends TExpected, TExpected>(): void {}

describe('field shared prop contracts', () => {
  it('keeps the shared contract assertions in typecheck scope', () => {
    // 中文说明：这些调用没有运行期断言，只把共享 props 契约纳入 TypeScript 检查。
    assertExtends<FieldPermissionProps<string>, {
      field?: string | undefined
      label?: string | undefined
      value?: string | undefined
    }>()
    assertExtends<RDateProps, SparkTemporalPickerProps & SparkRangeFilterProps>()
    assertExtends<RNumberProps, SparkFieldSemanticProps & SparkNumericBoundsProps & SparkRangeFilterProps>()
    assertExtends<RSliderProps, SparkFieldSemanticProps & SparkNumericBoundsProps>()
    assertExtends<RRateProps, SparkFieldSemanticProps & SparkNumericMaxProps>()
    assertExtends<RCascaderProps, SparkHierarchicalSelectionProps>()
    assertExtends<RTreeSelectProps, SparkHierarchicalSelectionProps>()
    assertExtends<RRadioProps, SparkOptionButtonStyleProps>()
    assertExtends<RCheckboxGroupProps, SparkOptionButtonStyleProps>()
    assertExtends<RTextareaProps, SparkMultilineRowsProps>()
    assertExtends<RHtmlEditorProps, SparkMultilineRowsProps>()
    assertExtends<RMentionProps, SparkMultilineRowsProps>()
    assertExtends<RFilePathProps, SparkFilePickerFieldProps>()
    assertExtends<RUploadProps, SparkFileFieldProps & SparkFileUploadActionProps>()
    assertExtends<REntityPickerProps, SparkPrimaryActionTextProps & SparkReadonlyActionTextProps>()
    expect(true).toBe(true)
  })
})
