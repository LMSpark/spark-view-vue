/**
 * 集中管理多租户 API 路径 — 所有前端 API 调用统一从此模块获取基础路径。
 *
 * 当前硬编码 lmspark / homepage，后续可从运行时配置或路由参数动态获取。
 */

const TENANT_ID = 'lmspark'
const PROJECT_ID = 'homepage'

const SCOPE = `/api/tenants/${TENANT_ID}/projects/${PROJECT_ID}`

/** 导航 API 基础路径 — `/api/tenants/lmspark/projects/homepage/navigation` */
export const NAV_API = `${SCOPE}/navigation`

/** 页面配置 API 基础路径 — `/api/tenants/lmspark/projects/homepage/pages-config` */
export const PAGE_API = `${SCOPE}/pages-config`

/** 通用表数据 API 基础路径 — `/api/tenants/lmspark/projects/homepage/data` */
export const DATA_API = `${SCOPE}/data`
