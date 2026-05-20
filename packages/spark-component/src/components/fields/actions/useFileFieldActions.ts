import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type {
  PageBrowseFilesOptions,
  PageSelectedFile,
  PageServiceCapability,
  PageUploadFilesOptions,
  PageUploadedFile,
} from '../../internal'
import { useFieldActionMode } from './useFieldActionMode'

interface UseFileFieldActionsOptions {
  pageService: PageServiceCapability | null
  isEditable: ComputedRef<boolean>
}

export function useFileFieldActions(options: UseFileFieldActionsOptions) {
  const { pageService, isEditable } = options
  const { chooseByMode } = useFieldActionMode({ isEditable })

  const hasBrowseCapability = computed(() => typeof pageService?.browseFiles === 'function')
  const hasUploadCapability = computed(() => typeof pageService?.uploadFiles === 'function')
  const primaryAction = chooseByMode<'upload' | 'browse'>('upload', 'browse')

  async function browseFiles(browseOptions?: PageBrowseFilesOptions): Promise<PageSelectedFile[]> {
    if (typeof pageService?.browseFiles !== 'function') return []
    return await pageService.browseFiles(browseOptions)
  }

  async function uploadFiles(uploadOptions: PageUploadFilesOptions): Promise<PageUploadedFile[]> {
    if (typeof pageService?.uploadFiles !== 'function') return []
    return await pageService.uploadFiles(uploadOptions)
  }

  return {
    hasBrowseCapability,
    hasUploadCapability,
    primaryAction,
    browseFiles,
    uploadFiles,
  }
}