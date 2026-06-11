/**
 * @module app:services/project-ui-settings
 * 职责：提供主应用 project-ui-settings 能力，围绕 ProjectUiSettings 连接视图、服务、布局、路由或平台租户流程。
 * 边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
 * AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 services/project-ui-settings。
 */
import type { PageMode } from '@spark-appworks/spark-app'
import { isRecord } from '@spark-appworks/spark-utils'

/** Project Ui Settings 的语义模型。 */
export type ProjectUiSettings = {
    /** header First 字段。 */
headerFirst: boolean
    /** sidebar Collapsed 字段。 */
sidebarCollapsed: boolean
    /** 是否 show Footer。 */
showFooter: boolean
    /** page Mode 字段。 */
pageMode: PageMode}

export const PROJECT_UI_SETTINGS_STORAGE_PREFIX = 'spark-ui-settings'

export const DEFAULT_PROJECT_UI_SETTINGS: ProjectUiSettings = {
  headerFirst: false,
  sidebarCollapsed: false,
  showFooter: true,
  pageMode: 'multi',
}

function normalizeScopeKey(scopeKey: string | null | undefined): string | null {
  if (typeof scopeKey !== 'string') return null
  const trimmed = scopeKey.trim()
  return trimmed.length > 0 ? trimmed : null
}


export function getProjectUiSettingsStorageKey(scopeKey: string | null): string {
  const normalized = normalizeScopeKey(scopeKey)
  return normalized === null
    ? PROJECT_UI_SETTINGS_STORAGE_PREFIX
    : `${PROJECT_UI_SETTINGS_STORAGE_PREFIX}:${normalized}`
}

function normalizeSettings(raw: unknown): ProjectUiSettings | null {
  if (!isRecord(raw)) return null
  return {
    headerFirst: typeof raw['headerFirst'] === 'boolean'
      ? raw['headerFirst']
      : DEFAULT_PROJECT_UI_SETTINGS.headerFirst,
    sidebarCollapsed: typeof raw['sidebarCollapsed'] === 'boolean'
      ? raw['sidebarCollapsed']
      : DEFAULT_PROJECT_UI_SETTINGS.sidebarCollapsed,
    showFooter: typeof raw['showFooter'] === 'boolean'
      ? raw['showFooter']
      : DEFAULT_PROJECT_UI_SETTINGS.showFooter,
    pageMode: raw['pageMode'] === 'single' || raw['pageMode'] === 'multi'
      ? raw['pageMode']
      : DEFAULT_PROJECT_UI_SETTINGS.pageMode,
  }
}

export function loadProjectUiSettings(scopeKey: string | null): ProjectUiSettings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_PROJECT_UI_SETTINGS }
    const raw = localStorage.getItem(getProjectUiSettingsStorageKey(scopeKey))
    if (raw === null) return { ...DEFAULT_PROJECT_UI_SETTINGS }
    return normalizeSettings(JSON.parse(raw)) ?? { ...DEFAULT_PROJECT_UI_SETTINGS }
  } catch {
    return { ...DEFAULT_PROJECT_UI_SETTINGS }
  }
}

export function saveProjectUiSettings(scopeKey: string | null, settings: ProjectUiSettings): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(getProjectUiSettingsStorageKey(scopeKey), JSON.stringify(settings))
  } catch {
    // localStorage may be unavailable in restricted browser contexts.
  }
}
