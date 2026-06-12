/**
 * @module app:services/project/project-settings
 * 职责：项目运行时设置（HTTP）与壳层 UI 偏好（localStorage）。
 * 边界：只处理 app 层配置读写，不修改 spark-project-model 协议。
 */
import type { PageMode } from '@spark-appworks/spark-app'
import {
  normalizeNavRoot,
  type ProjectModelData,
  type ProjectNodeData,
} from '@spark-appworks/spark-project-model'
import { isRecord } from '@spark-appworks/spark-utils'
import { http } from '@/services/http'
import { getProjectDetailApi, getProjectNavigationApi } from '@/services/api-paths'

/** Project Layout Placement 的语义模型。 */
export type ProjectLayoutPlacement = 'header' | 'sidebar'

/** Project Detail 的语义模型。 */
export type ProjectDetail = {
  tenantId: string
  projectId: string
  name: string
  projectType: string
  icon: string
  description: string
  homeNodeId: string | null
  order: number
}

/** Project Home Node Option 的语义模型。 */
export type ProjectHomeNodeOption = {
  id: string
  title: string
  path: string
  label: string
}

/** Project Runtime Settings 的语义模型。 */
export type ProjectRuntimeSettings = {
  project: ProjectDetail
  childPlacement: ProjectLayoutPlacement
  rootModuleId: string | null
  homeNodeOptions: ProjectHomeNodeOption[]
}

/** Project Runtime Settings Input 的输入数据。 */
export type ProjectRuntimeSettingsInput = {
  childPlacement: ProjectLayoutPlacement
  homeNodeId: string | null
}

const HOME_NODE_KINDS = new Set(['page', 'system-page', 'link'])

function readProjectDetail(raw: Record<string, unknown>): ProjectDetail {
  return {
    tenantId: String(raw['tenantId'] ?? ''),
    projectId: String(raw['projectId'] ?? ''),
    name: String(raw['name'] ?? ''),
    projectType: String(raw['projectType'] ?? ''),
    icon: String(raw['icon'] ?? ''),
    description: String(raw['description'] ?? ''),
    homeNodeId: readOptionalString(raw['homeNodeId']),
    order: typeof raw['order'] === 'number' ? raw['order'] : Number(raw['order'] ?? 0),
  }
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function collectHomeNodeOptions(nodes: readonly ProjectNodeData[]): ProjectHomeNodeOption[] {
  const rows: ProjectHomeNodeOption[] = []
  const walk = (list: readonly ProjectNodeData[]): void => {
    for (const node of list) {
      const kind = node.nodeKind ?? 'page'
      const path = node.path?.trim() ?? ''
      if (HOME_NODE_KINDS.has(kind) && path) {
        rows.push({
          id: node.id,
          title: node.title,
          path,
          label: `${node.title} — ${path}`,
        })
      }
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  return rows
}

function resolveRootModuleId(nav: ProjectModelData): string | null {
  const rootId = nav.id?.trim()
  if (!rootId) return null
  return rootId
}

export async function loadProjectRuntimeSettings(
  tenantId: string,
  projectId: string,
): Promise<ProjectRuntimeSettings> {
  const [projectRaw, navRaw] = await Promise.all([
    http.get<Record<string, unknown>>(getProjectDetailApi(projectId, tenantId)),
    http.get<Partial<ProjectModelData>>(getProjectNavigationApi(projectId, tenantId)),
  ])
  const project = readProjectDetail(projectRaw)
  const nav = normalizeNavRoot(navRaw)
  const placement = nav.childPlacement === 'sidebar' ? 'sidebar' : 'header'
  return {
    project,
    childPlacement: placement,
    rootModuleId: resolveRootModuleId(nav),
    homeNodeOptions: collectHomeNodeOptions(nav.children),
  }
}

/** Save Project Runtime Settings Command 的命令参数。 */
export type SaveProjectRuntimeSettingsCommand = Readonly<{
  tenantId: string
  projectId: string
  current: ProjectRuntimeSettings
  input: ProjectRuntimeSettingsInput
}>

export async function saveProjectRuntimeSettings(command: SaveProjectRuntimeSettingsCommand): Promise<void> {
  const { tenantId, projectId, current, input } = command
  const homeChanged = (current.project.homeNodeId ?? '') !== (input.homeNodeId ?? '')
  const layoutChanged = current.childPlacement !== input.childPlacement

  if (homeChanged) {
    await http.put(getProjectDetailApi(projectId, tenantId), {
      homeNodeId: input.homeNodeId ?? '',
    })
  }

  if (layoutChanged) {
    if (!current.rootModuleId) {
      throw new Error('导航根模块未加载，无法保存项目布局')
    }
    await http.put(`${getProjectNavigationApi(projectId, tenantId)}/nodes/${encodeURIComponent(current.rootModuleId)}`, {
      childPlacement: input.childPlacement,
    })
  }
}

/** Project Ui Settings 的语义模型。 */
export type ProjectUiSettings = {
  headerFirst: boolean
  sidebarCollapsed: boolean
  showFooter: boolean
  pageMode: PageMode
}

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

function normalizeUiSettings(raw: unknown): ProjectUiSettings | null {
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
    return normalizeUiSettings(JSON.parse(raw)) ?? { ...DEFAULT_PROJECT_UI_SETTINGS }
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
