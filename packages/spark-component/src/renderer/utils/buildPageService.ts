/**
 * PAGE_SERVICE 能力构建工厂
 *
 * 从 usePageRenderer 提取——构建 IPageServiceCapability 实现，
 * 优先使用 props 注入的 UI 服务（测试/Storybook），回退到 Element Plus。
 */

import type { Router } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { IPageServiceCapability } from '@spark-view/spark-utils'
import { pageLogger } from './bind-helpers'

/** ElMessageBox 取消时抛出 'cancel' 字符串或 { action: 'cancel' }，用于区分真正的异常 */
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
  } | undefined
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
  return {
    showMessage: (message, type = 'info') => {
      const fn = overrides?.messageService?.[type]
      if (typeof fn === 'function') { fn(message); return }
      ElMessage({ message, type })
    },

    showConfirm: async (
      message: string,
      title?: string,
      options?: { confirmText?: string; cancelText?: string; type?: 'warning' | 'info' | 'error' | 'success' }
    ) => {
      if (overrides?.confirmService) {
        await overrides.confirmService.confirm(message, title)
        return true
      }
      try {
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
