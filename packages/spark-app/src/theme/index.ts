/**
 * SPARK 主题服务
 *
 * 基于 @vueuse/core useColorMode 实现，支持：
 * - light / dark / auto（跟随系统偏好）三模式
 * - Element Plus 暗黑模式自动切换（html.dark class）
 * - localStorage 持久化
 * - 通过 SPARK 能力系统 provide 给组件树
 *
 * @example
 * ```ts
 * import { createThemeService } from '@spark-view/spark-app'
 *
 * const theme = createThemeService()
 * theme.setMode('dark')
 * console.log(theme.isDark) // true
 * ```
 */

import { useColorMode, type BasicColorMode } from '@vueuse/core'
import { computed, inject, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue'
export type ThemeMode = 'light' | 'dark' | 'auto'

export interface IThemeCapability {
  readonly current: 'light' | 'dark'
  readonly mode: ThemeMode
  setMode(mode: ThemeMode): void
  readonly isDark: boolean
  toggle(): void
}

/** Vue DI 注入键（仅供 App.vue / Settings.vue 等非 SPARK 组件使用） */
export const THEME_INJECTION_KEY: InjectionKey<IThemeCapability> = Symbol('spark-theme')

/** 主题服务配置 */
export interface ThemeServiceOptions {
  /** 初始模式（默认 'auto'） */
  initialMode?: ThemeMode
  /** localStorage 存储键名（默认 'spark-theme-mode'） */
  storageKey?: string
}

/** 响应式主题服务（内部使用，组件层可直接读 ref） */
export interface ThemeServiceReactive extends IThemeCapability {
  /** 响应式当前模式 */
  readonly modeRef: Ref<string>
  /** 响应式 isDark */
  readonly isDarkRef: ComputedRef<boolean>
}

/**
 * 创建主题服务
 *
 * 需要在 Vue 应用或 effectScope 内调用（依赖 Vue 响应式系统）。
 */
export function createThemeService(options: ThemeServiceOptions = {}): ThemeServiceReactive {
  const {
    initialMode = 'auto',
    storageKey = 'spark-theme-mode',
  } = options

  const colorMode = useColorMode({
    // 'auto' = 跟随系统 prefers-color-scheme，'light' / 'dark' = 强制
    initialValue: initialMode === 'auto' ? 'auto' : initialMode,
    storageKey,
    // Element Plus 暗黑模式通过 html.dark class 触发
    attribute: 'class',
    modes: {
      dark: 'dark',
      light: '',
    },
  })

  // colorMode.store = 用户设置（可能是 'auto'）
  // colorMode.state = 实际解析后的值（'light' | 'dark'）
  const storeMode = colorMode.store
  const resolvedMode = colorMode

  const isDarkRef = computed(() => resolvedMode.value === 'dark')

  // 同步 VXE Table 主题属性（vxe-table 使用 data-vxe-ui-theme 切换暗色）
  if (typeof document !== 'undefined') {
    const syncVxeTheme = (dark: boolean) => {
      document.documentElement.setAttribute('data-vxe-ui-theme', dark ? 'dark' : 'light')
    }
    // 初始同步
    syncVxeTheme(isDarkRef.value)
    // 响应式同步
    watch(isDarkRef, syncVxeTheme)
  }

  const service: ThemeServiceReactive = {
    get current(): 'light' | 'dark' {
      return resolvedMode.value as BasicColorMode
    },
    get mode(): ThemeMode {
      return storeMode.value as ThemeMode
    },
    setMode(mode: ThemeMode): void {
      storeMode.value = mode
    },
    get isDark(): boolean {
      return isDarkRef.value
    },
    toggle(): void {
      // 如果当前 resolved 为 dark → 切到 light；否则切到 dark
      storeMode.value = isDarkRef.value ? 'light' : 'dark'
    },
    modeRef: storeMode,
    isDarkRef,
  }

  return service
}

/**
 * 在 Vue 组件中获取主题服务
 *
 * 需要在 `app.provide(THEME_INJECTION_KEY, themeService)` 之后使用。
 * 适用于 App.vue / Settings.vue 等非 SPARK 组件；
 * SPARK 组件使用 `consume(THEME)` 获取。
 */
export function useTheme(): IThemeCapability | undefined {
  return inject(THEME_INJECTION_KEY, undefined)
}
