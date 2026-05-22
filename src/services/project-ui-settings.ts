import type { PageMode } from '@spark-view/spark-app'

export type ProjectUiSettings = {
  headerFirst: boolean
  sidebarCollapsed: boolean
  showFooter: boolean
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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
