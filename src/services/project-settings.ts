import {
  normalizeNavRoot,
  type ProjectModelData,
  type ProjectNodeData,
} from '@spark-appworks/spark-project-model'
import { http } from '@/services/http'
import { getProjectDetailApi, getProjectNavigationApi } from '@/services/api-paths'

export type ProjectLayoutPlacement = 'header' | 'sidebar'

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

export type ProjectHomeNodeOption = {
  id: string
  title: string
  path: string
  label: string
}

export type ProjectRuntimeSettings = {
  project: ProjectDetail
  childPlacement: ProjectLayoutPlacement
  rootModuleId: string | null
  homeNodeOptions: ProjectHomeNodeOption[]
}

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

export async function saveProjectRuntimeSettings(
  tenantId: string,
  projectId: string,
  current: ProjectRuntimeSettings,
  input: ProjectRuntimeSettingsInput,
): Promise<void> {
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
