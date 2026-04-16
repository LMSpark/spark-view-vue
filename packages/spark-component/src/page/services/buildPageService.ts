/**
 * PAGE_SERVICE 能力构建工厂
 *
 * 构建 IPageServiceCapability 实现，
 * 优先使用 props 注入的 UI 服务（测试/Storybook），回退到 Element Plus。
 */

import type { Router } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
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
} from '../../core/capability-system.js'
import type { RequestError } from '@spark-view/spark-utils'
import { createRequest } from '@spark-view/spark-utils'
import { pageLogger } from './pageLogger'

/** 内部实现：ElMessageBox.confirm() 取消时抛出 'cancel' 字符串或 { action: 'cancel' }，用于区分真正的异常。这是 IPageServiceCapability 内部实现细节，script.js 不能直接访问 ElMessageBox（已从沙箱移除）。 */
function isElCancelAction(e: unknown): boolean {
  if (e === 'cancel') return true
  return typeof e === 'object' && e !== null && (e as Record<string, unknown>)['action'] === 'cancel'
}

/** 可选的外部 UI 服务注入（测试 / Storybook 用） */
export interface PageServiceOverrides {
  messageService?: {
    success: (msg: string) => void
    warning: (msg: string) => void
    error: (msg: string) => void
    info: (msg: string) => void
  } | undefined
  confirmService?: {
    confirm: (msg: string, title?: string) => Promise<unknown>
    alert: (msg: string, title?: string) => Promise<unknown>
    prompt?: (msg: string, title?: string) => Promise<string | null>
  } | undefined
  pageService?: Partial<IPageServiceCapability> | undefined
}

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

function createFilePicker(options?: IPageBrowseFilesOptions): Promise<IPageSelectedFile[]> {
  return new Promise((resolve) => {
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

function normalizeSelectorKeys(value: IPageSelectEntitiesOptions['currentValue'] | undefined): string[] {
  if (Array.isArray(value)) return value.map(item => String(item))
  if (typeof value === 'string') {
    if (!value.trim()) return []
    return value.split(',').map(item => item.trim()).filter(Boolean)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  return []
}

function selectFallbackEntities(options: IPageSelectEntitiesOptions): IPageSelectedEntity[] {
  const candidates = options.options?.filter(option => option.disabled !== true) ?? []
  if (candidates.length === 0) return []
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') return []

  const title = options.title ?? `选择${options.entityName ?? '项目'}`
  const defaultValue = normalizeSelectorKeys(options.currentValue).join(', ')
  const message = [
    title,
    candidates.map(option => `${option.label} (${String(option.value)})`).join('\n'),
    options.multiple ? '请输入 value，多个用逗号分隔' : '请输入 value',
  ].join('\n\n')

  const input = window.prompt(message, defaultValue)
  if (input === null) return []

  const selectedKeys = normalizeSelectorKeys(input)
  const matched = candidates.filter(option => selectedKeys.includes(String(option.value)))
  if (options.multiple === true) return matched
  const firstMatch = matched[0]
  return firstMatch ? [firstMatch] : []
}

async function uploadSelectedFiles(options: IPageUploadFilesOptions): Promise<IPageUploadedFile[]> {
  const selectedFiles = options.files ?? (await createFilePicker(options)).map(item => item.file)
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

async function showFallbackDialog(options: IPageDialogOptions): Promise<PageDialogResult> {
  const title = options.title ?? '提示'
  const message = options.content ?? options.message ?? ''
  try {
    const sharedOptions = {
      confirmButtonText: options.confirmText ?? '确定',
      cancelButtonText: options.cancelText ?? '取消',
      dangerouslyUseHTMLString: options.dangerouslyUseHTMLString === true,
      type: options.type ?? 'info',
      ...(options.width ? { customStyle: { width: options.width } } : {}),
    }
    if (options.showCancelButton === true) {
      await ElMessageBox.confirm(message, title, {
        ...sharedOptions,
        distinguishCancelAndClose: true,
      })
    } else {
      await ElMessageBox.alert(message, title, sharedOptions)
    }
    return 'confirm'
  } catch (error) {
    if (error === 'cancel') return 'cancel'
    if (error === 'close' || isElCancelAction(error)) return 'close'
    pageLogger.warn('showDialog 异常', { error })
    return 'close'
  }
}

/**
 * 构建 PAGE_SERVICE 能力实现
 *
 * @param router    Vue Router 实例（navigate 需要）
 * @param overrides 可选的外部 UI 服务（测试 / Storybook 注入）
 */
export function buildPageService(
  router: Router,
  overrides?: PageServiceOverrides
): IPageServiceCapability {
  const extension = overrides?.pageService

  return {
    showMessage: (message, type = 'info') => {
      try {
        const fn = overrides?.messageService?.[type]
        if (typeof fn === 'function') { fn(message); return }
      } catch (e) {
        pageLogger.warn('messageService 调用异常', { type, error: e })
      }
      ElMessage({ message, type })
    },

    showConfirm: async (
      message: string,
      title?: string,
      options?: { confirmText?: string; cancelText?: string; type?: 'warning' | 'info' | 'error' | 'success' }
    ) => {
      try {
        if (overrides?.confirmService) {
          await overrides.confirmService.confirm(message, title)
          return true
        }
        const confirmText: string = options?.confirmText ?? '确定'
        const cancelText: string  = options?.cancelText  ?? '取消'
        const confirmType          = options?.type ?? 'warning'
        await ElMessageBox.confirm(message, title ?? '确认', {
          confirmButtonText: confirmText,
          cancelButtonText:  cancelText,
          type: confirmType,
        })
        return true
      } catch (e) {
        if (!isElCancelAction(e)) {
          pageLogger.warn('showConfirm 异常', { error: e })
        }
        return false
      }
    },

    showPrompt: async (
      message: string,
      title?: string,
      options?: { placeholder?: string; defaultValue?: string }
    ) => {
      try {
        if (overrides?.confirmService?.prompt) {
          return await overrides.confirmService.prompt(message, title)
        }
        const placeholder: string  = options?.placeholder  ?? ''
        const defaultValue: string = options?.defaultValue ?? ''
        const result = await ElMessageBox.prompt(message, title ?? '请输入', {
          confirmButtonText: '确定',
          cancelButtonText:  '取消',
          inputPlaceholder:  placeholder,
          inputValue:        defaultValue,
        })
        // ElMessageBox.prompt 结果类型是 MessageBoxData，需要运行时检查
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return typeof result === 'object' && result !== null && 'value' in result
          ? (result as { value: string }).value
          : null
      } catch (e) {
        if (!isElCancelAction(e)) {
          pageLogger.warn('showPrompt 异常', { error: e })
        }
        return null
      }
    },

    showAlert: async (
      message: string,
      title?: string,
      options?: { type?: 'warning' | 'info' | 'error' | 'success' }
    ) => {
      const alertType = options?.type ?? 'info'
      try {
        if (overrides?.confirmService) {
          await overrides.confirmService.alert(message, title)
          return
        }
        await ElMessageBox.alert(message, title ?? '提示', {
          confirmButtonText: '确定',
          type: alertType,
        })
      } catch (e) {
        if (!isElCancelAction(e)) {
          pageLogger.warn('showAlert 异常', { error: e })
        }
      }
    },

    showDialog: async (options) => {
      if (typeof extension?.showDialog === 'function') {
        return await extension.showDialog(options)
      }
      return await showFallbackDialog(options)
    },

    selectEntities: async (options) => {
      if (typeof extension?.selectEntities === 'function') {
        return await extension.selectEntities(options)
      }
      return selectFallbackEntities(options)
    },

    browseFiles: async (options) => {
      if (typeof extension?.browseFiles === 'function') {
        return await extension.browseFiles(options)
      }
      return await createFilePicker(options)
    },

    uploadFiles: async (options) => {
      if (typeof extension?.uploadFiles === 'function') {
        return await extension.uploadFiles(options)
      }
      return await uploadSelectedFiles(options)
    },

    showLoading: (_show, _text) => {
      if (import.meta.env.DEV) {
        console.warn('[PageRenderer] showLoading 尚未接入全局加载遮罩服务')
      }
    },

    navigate: (path, params) => {
      router.push(params ? { path, query: params as Record<string, string> } : path)
        .catch((err: unknown) => { pageLogger.warn('导航失败', { path, error: err }) })
    },
  }
}
