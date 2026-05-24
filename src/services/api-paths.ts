/**
 * 集中管理多租户 API 路径 — 所有前端 API 调用统一从此模块获取基础路径。
 *
 * 动态读取当前登录用户的 tenantId / defaultProjectId，
 * 生成作用域路径 `/api/tenants/{tenantId}/projects/{projectId}/...`。
 */

import { getUser, isPlatformAdminUser } from './auth'
import { parseTenantScope, type TenantProjectScope } from './tenant-scope'

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



/** 项目管理 API 基础路径 — `/api/tenants/{tenantId}/projects` */
export function getProjectApi(): string {
  const user = getUser()
  if (!user) {
    throw new Error('缺少登录用户，无法构造项目 API 路径')
  }
  const urlScope = typeof window !== 'undefined' ? parseTenantScope(window.location.pathname) : null
  const tenantId = isPlatformAdminUser(user) && urlScope !== null ? urlScope.tenantId : user.tenantId
  return `/api/tenants/${tenantId}/projects`
}

/** 数据模型 API 基础路径 — `/api/tenants/{tenantId}/projects/{projectId}/data-model` */
export function getDataModelApi(): string {
  return `${getScopePath()}/data-model`
}

/** 数据库管理 API 基础路径 — `/api/tenants/{tenantId}/projects/{projectId}/databases` */
export function getDatabaseApi(): string {
  return `${getScopePath()}/databases`
}

/** 表关系 API 基础路径 — `/api/tenants/{tenantId}/projects/{projectId}/table-relations` */
export function getTableRelationApi(): string {
  return `${getScopePath()}/table-relations`
}

/** 动态数据 API 基础路径 — `/api/tenants/{tenantId}/projects/{projectId}/data` */
export function getDataApi(): string {
  return `${getScopePath()}/data`
}

/** 服务器管理 API 基础路径 — `/api/servers`（不受租户/项目作用域限制） */
export function getServerApi(): string {
  return '/api/servers'
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
