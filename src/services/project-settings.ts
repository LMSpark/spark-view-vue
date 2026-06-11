/**
 * @module app:services/project-settings
 * 职责：提供主应用 project-settings 能力，围绕 ProjectLayoutPlacement、ProjectDetail、ProjectHomeNodeOption 等 6 个公开契约 连接视图、服务、布局、路由或平台租户流程。
 * 边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
 * AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 services/project-settings。
 */
import {
  normalizeNavRoot,
  type ProjectModelData,
  type ProjectNodeData,
} from '@spark-appworks/spark-project-model'
import { http } from '@/services/http'
import { getProjectDetailApi, getProjectNavigationApi } from '@/services/api-paths'

/** Project Layout Placement 的语义模型。 */
export type ProjectLayoutPlacement = 'header' | 'sidebar'

/** Project Detail 的语义模型。 */
export type ProjectDetail = {
    /** tenant Id 标识。 */
tenantId: string
    /** project Id 标识。 */
projectId: string
    /** 显示或业务名称。 */
name: string
    /** project Type 字段。 */
projectType: string
    /** icon 字段。 */
icon: string
    /** description 字段。 */
description: string
    /** home Node Id 标识。 */
homeNodeId: string | null
    /** order 字段。 */
order: number
}

/** Project Home Node Option 的语义模型。 */
export type ProjectHomeNodeOption = {
    /** 唯一标识。 */
id: string
    /** 显示标题。 */
title: string
    /** 资源路径。 */
path: string
    /** 展示标签。 */
label: string
}

/** Project Runtime Settings 的语义模型。 */
export type ProjectRuntimeSettings = {
    /** project 字段。 */
project: ProjectDetail
    /** child Placement 字段。 */
childPlacement: ProjectLayoutPlacement
    /** root Module Id 标识。 */
rootModuleId: string | null
    /** home Node Options 配置项。 */
homeNodeOptions: ProjectHomeNodeOption[]
}

/** Project Runtime Settings Input 的输入数据。 */
export type ProjectRuntimeSettingsInput = {
    /** child Placement 字段。 */
childPlacement: ProjectLayoutPlacement
    /** home Node Id 标识。 */
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
