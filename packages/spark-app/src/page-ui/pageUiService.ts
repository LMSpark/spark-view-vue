import { reactive } from 'vue'
import { createRequest } from '@spark-view/spark-utils'
import type { RequestError } from '@spark-view/spark-utils'
import type {
  IPageBrowseFilesOptions,
  IPageDialogOptions,
  IPageSelectedEntity,
  IPageSelectEntitiesOptions,
  IPageServiceCapability,
  IPageSelectedFile,
  IPageUploadFilesOptions,
  IPageUploadedFile,
  PageDialogResult,
} from '@spark-view/spark-component'

interface DialogState {
  visible: boolean
  title: string
  content: string
  confirmText: string
  cancelText: string
  showCancelButton: boolean
  dangerouslyUseHTMLString: boolean
  width: string
}

interface SelectorState {
  visible: boolean
  title: string
  placeholder: string
  multiple: boolean
  searchable: boolean
  confirmText: string
  cancelText: string
  emptyText: string
  searchKeyword: string
  options: IPageSelectedEntity[]
  selectedValues: string[]
}

const dialogState = reactive<DialogState>({
  visible: false,
  title: '',
  content: '',
  confirmText: '确定',
  cancelText: '取消',
  showCancelButton: false,
  dangerouslyUseHTMLString: false,
  width: '560px',
})

const selectorState = reactive<SelectorState>({
  visible: false,
  title: '',
  placeholder: '请输入关键字',
  multiple: false,
  searchable: true,
  confirmText: '确定',
  cancelText: '取消',
  emptyText: '暂无可选项',
  searchKeyword: '',
  options: [],
  selectedValues: [],
})

let dialogResolver: ((result: PageDialogResult) => void) | null = null
let selectorResolver: ((result: IPageSelectedEntity[]) => void) | null = null

function mapFile(file: File): IPageSelectedFile {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    file,
  }
}

function extractUploadedUrl(response: unknown): string | undefined {
  if (typeof response !== 'object' || response === null) return undefined
  const record = response as Record<string, unknown>
  const candidate = record['url'] ?? record['path'] ?? record['filePath'] ?? record['data']
  if (typeof candidate === 'string') return candidate
  if (typeof candidate === 'object' && candidate !== null) {
    const nested = candidate as Record<string, unknown>
    const nestedCandidate = nested['url'] ?? nested['path'] ?? nested['filePath']
    return typeof nestedCandidate === 'string' ? nestedCandidate : undefined
  }
  return undefined
}

function normalizeSelectorKeys(value: IPageSelectEntitiesOptions['currentValue'] | undefined): string[] {
  if (Array.isArray(value)) return value.map(item => String(item))
  if (typeof value === 'string') {
    if (!value.trim()) return []
    return value.split(',').map(item => item.trim()).filter(Boolean)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  return []
}

async function browseFiles(options?: IPageBrowseFilesOptions): Promise<IPageSelectedFile[]> {
  return await new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.style.display = 'none'
    input.accept = options?.accept ?? ''
    input.multiple = options?.multiple === true
    input.onchange = () => {
      const files = Array.from(input.files ?? []).map(mapFile)
      input.remove()
      resolve(files)
    }
    input.oncancel = () => {
      input.remove()
      resolve([])
    }
    document.body.appendChild(input)
    input.click()
  })
}

async function selectEntities(options: IPageSelectEntitiesOptions): Promise<IPageSelectedEntity[]> {
  if (selectorResolver) {
    selectorResolver([])
  }

  selectorState.title = options.title ?? `选择${options.entityName ?? '项目'}`
  selectorState.placeholder = options.placeholder ?? '请输入关键字'
  selectorState.multiple = options.multiple === true
  selectorState.searchable = options.searchable !== false
  selectorState.confirmText = options.confirmText ?? '确定'
  selectorState.cancelText = options.cancelText ?? '取消'
  selectorState.emptyText = options.emptyText ?? '暂无可选项'
  selectorState.searchKeyword = ''
  selectorState.options = options.options?.slice() ?? []
  selectorState.selectedValues = normalizeSelectorKeys(options.currentValue)
  selectorState.visible = true

  return await new Promise<IPageSelectedEntity[]>((resolve) => {
    selectorResolver = resolve
  })
}

async function uploadFiles(options: IPageUploadFilesOptions): Promise<IPageUploadedFile[]> {
  const selectedFiles = options.files ?? (await browseFiles(options)).map(item => item.file)
  if (selectedFiles.length === 0) return []

  const results: IPageUploadedFile[] = []
  for (const file of selectedFiles) {
    const formData = new FormData()
    formData.append(options.fieldName ?? 'file', file)
    const extraData = options.data ?? {}
    for (const [key, value] of Object.entries(extraData)) {
      formData.append(key, value)
    }

    const client = createRequest()
    const headers: Record<string, string> = {}
    if (options.headers !== undefined) {
      Object.assign(headers, options.headers)
    }

    let responseData: unknown
    try {
      responseData = await client.post<unknown>(options.action, formData, {
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ...(options.withCredentials === true ? { withCredentials: true } : {}),
      })
    } catch (err) {
      responseData = (err as RequestError).response
    }
    const uploadedUrl = extractUploadedUrl(responseData)
    results.push({
      ...mapFile(file),
      response: responseData,
      ...(uploadedUrl !== undefined ? { url: uploadedUrl } : {}),
    })
  }

  return results
}

async function showDialog(options: IPageDialogOptions): Promise<PageDialogResult> {
  if (dialogResolver) {
    dialogResolver('close')
  }

  dialogState.title = options.title ?? '提示'
  dialogState.content = options.content ?? options.message ?? ''
  dialogState.confirmText = options.confirmText ?? '确定'
  dialogState.cancelText = options.cancelText ?? '取消'
  dialogState.showCancelButton = options.showCancelButton === true
  dialogState.dangerouslyUseHTMLString = options.dangerouslyUseHTMLString === true
  dialogState.width = options.width ?? '560px'
  dialogState.visible = true

  return await new Promise<PageDialogResult>((resolve) => {
    dialogResolver = resolve
  })
}

function resolveDialog(result: PageDialogResult): void {
  const resolver = dialogResolver
  dialogResolver = null
  dialogState.visible = false
  if (resolver) resolver(result)
}

function resolveSelector(result: IPageSelectedEntity[]): void {
  const resolver = selectorResolver
  selectorResolver = null
  selectorState.visible = false
  selectorState.searchKeyword = ''
  if (resolver) resolver(result)
}

export const appPageUiState = {
  dialog: dialogState,
  selector: selectorState,
}

export const appPageUiService: Pick<IPageServiceCapability, 'showDialog' | 'selectEntities' | 'browseFiles' | 'uploadFiles'> = {
  showDialog,
  selectEntities,
  browseFiles,
  uploadFiles,
}

export function confirmAppDialog(): void {
  resolveDialog('confirm')
}

export function cancelAppDialog(): void {
  resolveDialog('cancel')
}

export function closeAppDialog(): void {
  resolveDialog('close')
}

export function confirmAppSelector(): void {
  const selected = selectorState.selectedValues
    .map((selectedValue) => selectorState.options.find(option => String(option.value) === selectedValue) ?? null)
    .filter((option): option is IPageSelectedEntity => option !== null)
  resolveSelector(selectorState.multiple ? selected : selected.slice(0, 1))
}

export function cancelAppSelector(): void {
  resolveSelector([])
}

export function closeAppSelector(): void {
  resolveSelector([])
}
