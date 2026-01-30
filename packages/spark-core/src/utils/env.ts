export const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

export function getWindow(): Window | undefined {
  return typeof window !== 'undefined' ? window : undefined
}

export function getDocument(): Document | undefined {
  return typeof document !== 'undefined' ? document : undefined
}

export function safeAddEventListener(target: any, event: string, handler: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
  if (!target || !isBrowser) return
  try { target.addEventListener(event, handler as any, options) } catch { /* noop */ }
}

export function safeRemoveEventListener(target: any, event: string, handler: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) {
  if (!target || !isBrowser) return
  try { target.removeEventListener(event, handler as any, options) } catch { /* noop */ }
}

export function storageAvailable(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const ls = window.localStorage
    const testKey = '__spark_storage_test__'
    ls.setItem(testKey, '1')
    ls.removeItem(testKey)
    return true
  } catch { return false }
}

export function readLocalStorage(key: string) {
  if (!storageAvailable()) return null
  try { return window.localStorage.getItem(key) } catch { return null }
}

export function writeLocalStorage(key: string, value: string) {
  if (!storageAvailable()) return
  try { window.localStorage.setItem(key, value) } catch { /* noop */ }
}

export function removeLocalStorage(key: string) {
  if (!storageAvailable()) return
  try { window.localStorage.removeItem(key) } catch { /* noop */ }
}
