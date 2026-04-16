import { describe, expect, it } from 'vitest'
import type {
  SparkFieldProps,
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

type Extends<T, U> = [T] extends [U] ? true : false
type AssertTrue<T extends true> = T

type _FieldPermissionPropsTracksSharedFieldContract = AssertTrue<Extends<
  FieldPermissionProps<string>,
  {
    field?: string | undefined
    label?: string | undefined
    value?: string | undefined
  }
>>

type _DatePropsReuseTemporalAndRangeContracts = AssertTrue<Extends<
  RDateProps,
  SparkTemporalPickerProps & SparkRangeFilterProps
>>

type _NumberPropsReuseNumericBoundsAndRangeContracts = AssertTrue<Extends<
  RNumberProps,
  SparkFieldProps & SparkNumericBoundsProps & SparkRangeFilterProps
>>

type _SliderPropsReuseNumericBoundsContract = AssertTrue<Extends<
  RSliderProps,
  SparkFieldProps & SparkNumericBoundsProps
>>

type _RatePropsReuseNumericMaxContract = AssertTrue<Extends<
  RRateProps,
  SparkFieldProps & SparkNumericMaxProps
>>

type _CascaderPropsReuseHierarchicalSelectionContract = AssertTrue<Extends<
  RCascaderProps,
  SparkHierarchicalSelectionProps
>>

type _TreeSelectPropsReuseHierarchicalSelectionContract = AssertTrue<Extends<
  RTreeSelectProps,
  SparkHierarchicalSelectionProps
>>

type _RadioPropsReuseOptionButtonStyleContract = AssertTrue<Extends<
  RRadioProps,
  SparkOptionButtonStyleProps
>>

type _CheckboxGroupPropsReuseOptionButtonStyleContract = AssertTrue<Extends<
  RCheckboxGroupProps,
  SparkOptionButtonStyleProps
>>

type _TextareaPropsReuseMultilineRowsContract = AssertTrue<Extends<
  RTextareaProps,
  SparkMultilineRowsProps
>>

type _HtmlEditorPropsReuseMultilineRowsContract = AssertTrue<Extends<
  RHtmlEditorProps,
  SparkMultilineRowsProps
>>

type _MentionPropsReuseMultilineRowsContract = AssertTrue<Extends<
  RMentionProps,
  SparkMultilineRowsProps
>>

type _FilePathPropsReuseFilePickerContract = AssertTrue<Extends<
  RFilePathProps,
  SparkFilePickerFieldProps
>>

type _UploadPropsReuseFileContracts = AssertTrue<Extends<
  RUploadProps,
  SparkFileFieldProps & SparkFileUploadActionProps
>>

type _EntityPickerPropsReuseActionTextContracts = AssertTrue<Extends<
  REntityPickerProps,
  SparkPrimaryActionTextProps & SparkReadonlyActionTextProps
>>

type _FieldSharedContractAssertions = [
  _FieldPermissionPropsTracksSharedFieldContract,
  _DatePropsReuseTemporalAndRangeContracts,
  _NumberPropsReuseNumericBoundsAndRangeContracts,
  _SliderPropsReuseNumericBoundsContract,
  _RatePropsReuseNumericMaxContract,
  _CascaderPropsReuseHierarchicalSelectionContract,
  _TreeSelectPropsReuseHierarchicalSelectionContract,
  _RadioPropsReuseOptionButtonStyleContract,
  _CheckboxGroupPropsReuseOptionButtonStyleContract,
  _TextareaPropsReuseMultilineRowsContract,
  _HtmlEditorPropsReuseMultilineRowsContract,
  _MentionPropsReuseMultilineRowsContract,
  _FilePathPropsReuseFilePickerContract,
  _UploadPropsReuseFileContracts,
  _EntityPickerPropsReuseActionTextContracts,
]

describe('field shared prop contracts', () => {
  it('keeps the shared contract assertions in typecheck scope', () => {
    const _assertions: _FieldSharedContractAssertions | null = null
    expect(_assertions).toBeNull()
    expect(true).toBe(true)
  })
})