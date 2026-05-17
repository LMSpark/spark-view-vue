/**
 * 集中管理多租户 API 路径 — 所有前端 API 调用统一从此模块获取基础路径。
 *
 * 动态读取当前登录用户的 tenantId / defaultProjectId，
 * 生成作用域路径 `/api/tenants/{tenantId}/projects/{projectId}/...`。
 */

import { getUser } from './auth'

/** 获取当前用户的租户作用域路径前缀 */
function getScopePath(): string {
  const user = getUser()
  const tenantId = user?.tenantId ?? 'default'
  const projectId = user?.defaultProjectId ?? 'homepage'
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
  const tenantId = user?.tenantId ?? 'default'
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
