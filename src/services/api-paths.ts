/**
 * @module app:services/api-paths
 * 职责：提供应用运行时 service 层的 api paths 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * 集中管理多租户 API 路径 — 所有前端 API 调用统一从此模块获取基础路径。
 *
 * 动态读取当前登录用户的 tenantId / defaultProjectId，
 * 生成作用域路径 `/api/tenants/{tenantId}/projects/{projectId}/...`。
 */

import { getUser, isPlatformAdminUser } from './auth'
import { parseTenantScope, type TenantProjectScope } from './tenant-scope'

export type ProjectApiScope = {
    /** tenant Id 标识。 */
tenantId?: string
    /** project Id 标识。 */
projectId: string
}

function resolveTenantId(tenantId?: string): string {
  const user = getUser()
  if (!user) {
    throw new Error('缺少登录用户，无法构造租户作用域 API 路径')
  }
  const normalizedTenantId = tenantId?.trim()
  if (normalizedTenantId) return normalizedTenantId
  const urlScope: TenantProjectScope | null = typeof window !== 'undefined' ? parseTenantScope(window.location.pathname) : null
  return isPlatformAdminUser(user) && urlScope !== null ? urlScope.tenantId : user.tenantId
}

/** 获取当前用户的租户作用域路径前缀 */
function getScopePath(): string {
  const user = getUser()
  if (!user) {
    throw new Error('缺少登录用户，无法构造租户作用域 API 路径')
  }
  const urlScope: TenantProjectScope | null = typeof window !== 'undefined' ? parseTenantScope(window.location.pathname) : null
  const activeScope = isPlatformAdminUser(user) && urlScope !== null
    ? urlScope
    : { tenantId: user.tenantId, projectId: user.defaultProjectId }
  const tenantId = activeScope.tenantId
  const projectId = activeScope.projectId
  if (!tenantId || !projectId) {
    throw new Error('缺少 tenantId/projectId，无法构造租户作用域 API 路径')
  }
  return `/api/tenants/${tenantId}/projects/${projectId}`
}

/** 导航 API 基础路径 — `/api/tenants/{tenantId}/projects/{projectId}/navigation` */
export function getNavApi(): string {
  return `${getScopePath()}/navigation`
}

/** 页面配置 API 基础路径 — `/api/tenants/{tenantId}/projects/{projectId}/pages-config` */
export function getPageApi(): string {
  return `${getScopePath()}/pages-config`
}

/** Workflow 设计稿 API 基础路径 — `/api/tenants/{tenantId}/projects/{projectId}/workflow-designs` */
export function getWorkflowDesignApi(): string {
  return `${getScopePath()}/workflow-designs`
}



/** 项目管理 API 基础路径 — `/api/tenants/{tenantId}/projects` */
export function getProjectApi(tenantId?: string): string {
  const resolvedTenantId = resolveTenantId(tenantId)
  return `/api/tenants/${encodeURIComponent(resolvedTenantId)}/projects`
}

export function getProjectDetailApi(projectId: string, tenantId?: string): string {
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) {
    throw new Error('projectId 不能为空，无法构造项目详情 API 路径')
  }
  return `${getProjectApi(tenantId)}/${encodeURIComponent(normalizedProjectId)}`
}

export function getProjectNavigationApi(projectId: string, tenantId?: string): string {
  const resolvedTenantId = resolveTenantId(tenantId)
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) {
    throw new Error('projectId 不能为空，无法构造项目导航 API 路径')
  }
  return `/api/tenants/${encodeURIComponent(resolvedTenantId)}/projects/${encodeURIComponent(normalizedProjectId)}/navigation`
}

export function getProjectPageApi(projectId: string, tenantId?: string): string {
  const resolvedTenantId = resolveTenantId(tenantId)
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) {
    throw new Error('projectId 不能为空，无法构造项目页面配置 API 路径')
  }
  return `/api/tenants/${encodeURIComponent(resolvedTenantId)}/projects/${encodeURIComponent(normalizedProjectId)}/pages-config`
}

export function getProjectPlanningAttachmentApi(projectId: string, tenantId?: string): string {
  const resolvedTenantId = resolveTenantId(tenantId)
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) {
    throw new Error('projectId 不能为空，无法构造项目策划附件 API 路径')
  }
  return `/api/tenants/${encodeURIComponent(resolvedTenantId)}/projects/${encodeURIComponent(normalizedProjectId)}/planning-attachments`
}

export function getPlatformNavApi(): string {
  return '/api/platform/navigation'
}

export function getPlatformTenantApi(): string {
  return '/api/platform/tenants'
}

export function getTenantConfigApi(tenantId: string): string {
  return `/api/config/tenant/${encodeURIComponent(tenantId)}`
}
