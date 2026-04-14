import { computed } from 'vue'
import type { IPageSelectedFile, IPageUploadedFile } from '@spark-view/spark-utils'
import type {
  SparkFieldProps,
  SparkFileFieldProps,
  SparkFilePickerFieldProps,
  SparkFileUploadActionProps,
  SparkPrimaryActionTextProps,
  SparkReadonlyActionTextProps,
  ValueRef,
} from '../../../shared-types.js'

interface UploadBrowseFieldStateOptions {
  displayLabel: ValueRef<string>
  fieldName: ValueRef<string>
  currentRawStringValue: ValueRef<string>
  isCurrentFieldEditable: ValueRef<boolean>
  hasBrowseCapability: ValueRef<boolean>
  hasUploadCapability: ValueRef<boolean>
  primaryAction: ValueRef<'upload' | 'browse'>
  buttonText: ValueRef<NonNullable<SparkPrimaryActionTextProps['buttonText']>>
  readonlyButtonText: ValueRef<NonNullable<SparkReadonlyActionTextProps['readonlyButtonText']>>
  canClear: ValueRef<NonNullable<SparkFieldProps['clearable']>>
  action: ValueRef<NonNullable<SparkFileUploadActionProps['action']>>
  accept: ValueRef<NonNullable<SparkFileFieldProps['accept']>>
  multiple: ValueRef<NonNullable<SparkFilePickerFieldProps['multiple']>>
  separator: ValueRef<NonNullable<SparkFileFieldProps['separator']>>
  browseFiles: (options: {
    title: string
    accept: string
    multiple: boolean
    currentValue: string
  }) => Promise<IPageSelectedFile[]>
  uploadFiles: (options: {
    action: string
    accept: string
    multiple: boolean
    fieldName: string
    currentValue: string
  }) => Promise<IPageUploadedFile[]>
  updateValue: (value: string) => void | Promise<void>
  browseWritesValue?: boolean | undefined
  getBrowseValue?: ((file: IPageSelectedFile) => string) | undefined
  getUploadValue?: ((file: IPageUploadedFile) => string) | undefined
}

interface FileBrowserFieldStateOptions {
  displayLabel: ValueRef<string>
  currentRawStringValue: ValueRef<string>
  isCurrentFieldEditable: ValueRef<boolean>
  hasBrowseCapability: ValueRef<boolean>
  accept: ValueRef<NonNullable<SparkFileFieldProps['accept']>>
  multiple: ValueRef<NonNullable<SparkFilePickerFieldProps['multiple']>>
  separator: ValueRef<NonNullable<SparkFileFieldProps['separator']>>
  canClear: ValueRef<NonNullable<SparkFieldProps['clearable']>>
  browseFiles: (options: {
    title: string
    accept: string
    multiple: boolean
    currentValue: string
  }) => Promise<IPageSelectedFile[]>
  updateValue: (value: string) => void | Promise<void>
}

export function useUploadBrowseFieldState(options: UploadBrowseFieldStateOptions) {
  const canUpload = computed(() => options.hasUploadCapability.value && options.action.value.trim().length > 0 && options.action.value !== '#')
  const canPrimaryAction = computed(() => (options.primaryAction.value === 'upload' ? canUpload.value : options.hasBrowseCapability.value))
  const primaryActionText = computed(() => (options.primaryAction.value === 'upload' ? options.buttonText.value : options.readonlyButtonText.value))
  const showClearButton = computed(() => options.canClear.value && options.isCurrentFieldEditable.value && options.currentRawStringValue.value.length > 0)

  async function handleBrowse(): Promise<void> {
    const files = await options.browseFiles({
      title: options.displayLabel.value,
      accept: options.accept.value,
      multiple: options.multiple.value,
      currentValue: options.currentRawStringValue.value,
    })

    if (options.browseWritesValue !== true || !options.isCurrentFieldEditable.value) return
    const mapper = options.getBrowseValue ?? (file => file.name)
    const nextValue = files.map(mapper).join(options.separator.value)
    if (nextValue.length > 0) {
      await options.updateValue(nextValue)
    }
  }

  async function handleUpload(): Promise<void> {
    const files = await options.uploadFiles({
      action: options.action.value,
      accept: options.accept.value,
      multiple: options.multiple.value,
      fieldName: options.fieldName.value || 'file',
      currentValue: options.currentRawStringValue.value,
    })
    if (files.length === 0) return
    const mapper = options.getUploadValue ?? (file => file.url ?? file.name)
    const nextValue = files.map(mapper).join(options.separator.value)
    await options.updateValue(nextValue)
  }

  function handlePrimaryAction(): void {
    if (options.primaryAction.value === 'browse') {
      void handleBrowse()
      return
    }
    void handleUpload()
  }

  function clearValue(): void {
    void options.updateValue('')
  }

  return {
    canUpload,
    canPrimaryAction,
    primaryActionText,
    showClearButton,
    handleBrowse,
    handleUpload,
    handlePrimaryAction,
    clearValue,
  }
}

export function useFileBrowserFieldState(options: FileBrowserFieldStateOptions) {
  const showClearButton = computed(() => options.canClear.value && options.isCurrentFieldEditable.value && options.currentRawStringValue.value.length > 0)

  async function openFileDialog(): Promise<void> {
    const files = await options.browseFiles({
      title: options.displayLabel.value,
      accept: options.accept.value,
      multiple: options.multiple.value,
      currentValue: options.currentRawStringValue.value,
    })

    if (!options.isCurrentFieldEditable.value) return
    const nextValue = files.map(file => file.name).join(options.separator.value)
    if (nextValue.length > 0) {
      await options.updateValue(nextValue)
    }
  }

  function clearValue(): void {
    void options.updateValue('')
  }

  return {
    canBrowse: computed(() => options.hasBrowseCapability.value),
    showClearButton,
    openFileDialog,
    clearValue,
  }
}