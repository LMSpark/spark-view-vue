/**
 * Vue 组件页面映射表（单一定义源）
 *
 * - main.ts 从此表构建 componentMap（路径 → Component）传给 DynamicRouter
 * - DevNodeProps 从此表读取元数据，提供 vue-component 节点的组件选择器
 *
 * 新增 Vue 组件页面只需在此处添加一条记录，无需同步维护多处。
 */
import type { Component } from 'vue'
import type { AppNavRoot } from '@spark-view/spark-app'

/**
 * 页面作用域级别
 * - platform: 平台公共页面，无需登录，不绑定租户（如首页、登录、关于）
 * - tenant:   租户级页面，需登录+租户前缀，租户内共享（如设置、缓存管理、导航管理）
 * - app:      应用级页面，需登录+租户前缀+绑定具体应用/项目（如仪表盘、开发系统、AI Studio）
 */
export type PageScope = 'platform' | 'tenant' | 'app'

/** 组件页面描述 */
export interface VuePageEntry {
  /** 显示标题（用于编辑器选择器） */
  title: string
  /** 图标 */
  icon?: string
  /** 描述 */
  description?: string
  /** 页面作用域级别 */
  scope: PageScope
  /** 组件源文件路径（相对于项目根，用于定位和跳转） */
  source: string
  /** 导航树中隐藏（可路由但不显示在菜单） */
  hidden?: boolean
  /** 组件懒加载函数 */
  load: () => Promise<{ default: Component }>
}

/**
 * 路径 → 组件页面映射。
 *
 * - key 是**相对路径**（不含租户前缀），DynamicRouter 会自动拼接 tenantPathPrefix
 * - `load` 使用动态 import，首次访问时加载
 */
export const VUE_PAGE_MAP: Record<string, VuePageEntry> = {
  // ── platform: 平台公共页面 ──
  '/':                { title: '平台首页',    icon: 'HomeFilled',   scope: 'platform', source: 'src/views/platform/HomePage.vue',              load: () => import('../views/platform/HomePage.vue') },
  '/login':           { title: '登录',        icon: 'Key',          scope: 'platform', source: 'src/views/platform/LoginView.vue',             load: () => import('../views/platform/LoginView.vue'), description: '用户登录页面', hidden: true },
  '/about':           { title: '关于',        icon: 'InfoFilled',   scope: 'platform', source: 'src/views/platform/About.vue',                 load: () => import('../views/platform/About.vue') },
  '/demo/custom-r-table': { title: 'r-table Demo', icon: 'Grid', scope: 'platform', source: 'src/views/app/CustomRTableDemo.vue', load: () => import('../views/app/CustomRTableDemo.vue'), description: '原始 RendererTable 与模板字段桥接演示', hidden: true },
  '/demo/r-form-compare': { title: 'r-form Demo', icon: 'Tickets', scope: 'platform', source: 'src/views/app/RFormCompareDemo.vue', load: () => import('../views/app/RFormCompareDemo.vue'), description: '原始 RendererForm 配置式与模板式对照演示', hidden: true },
  // ── tenant: 租户级页面 ──
  '/settings':        { title: '设置',        icon: 'Setting',      scope: 'tenant',   source: 'src/views/tenant/Settings.vue',                load: () => import('../views/tenant/Settings.vue') },
  '/tenant-config':   { title: '租户配置',    icon: 'OfficeBuilding', scope: 'tenant', source: 'src/views/tenant/TenantConfig.vue',             load: () => import('../views/tenant/TenantConfig.vue') },
  '/cache-manager':   { title: '缓存管理',    icon: 'Coin',         scope: 'tenant',   source: 'src/views/tenant/CacheManager.vue',             load: () => import('../views/tenant/CacheManager.vue') },
  '/app-list':        { title: '应用列表',    icon: 'Grid',         scope: 'tenant',   source: 'src/views/tenant/AppList.vue',                  load: () => import('../views/tenant/AppList.vue') },
  // ── app: 应用级页面 ──
  '/dashboard':       { title: '仪表盘',      icon: 'DataBoard',    scope: 'app',      source: 'src/views/app/Dashboard.vue',                   load: () => import('../views/app/Dashboard.vue') },
  '/capability-demo': { title: '能力体系演示', icon: 'SetUp',        scope: 'app',      source: 'src/views/app/CapabilityDemo.vue',              load: () => import('../views/app/CapabilityDemo.vue') },
  '/nav-manager':     { title: '导航管理',    icon: 'Compass',      scope: 'app',      source: 'src/views/app/dev-system/DevSystem.vue',        load: () => import('../views/app/dev-system/DevSystem.vue'), description: '开发系统（导航管理入口）' },
  '/site-manager':    { title: '站点管理',    icon: 'Globe',        scope: 'app',      source: 'src/views/app/dev-system/DevSystem.vue',        load: () => import('../views/app/dev-system/DevSystem.vue'), description: '开发系统（站点管理入口）' },
  '/page-manager':    { title: '页面管理',    icon: 'Document',     scope: 'app',      source: 'src/views/app/dev-system/DevSystem.vue',        load: () => import('../views/app/dev-system/DevSystem.vue'), description: '开发系统（页面管理入口）' },
  '/dev':             { title: '开发系统',    icon: 'Tools',        scope: 'app',      source: 'src/views/app/dev-system/DevSystem.vue',        load: () => import('../views/app/dev-system/DevSystem.vue') },
  '/ai-studio':       { title: 'AI Studio',   icon: 'MagicStick',   scope: 'app',      source: 'src/views/app/ai-studio/AiStudioPanel.vue',     load: () => import('../views/app/ai-studio/AiStudioPanel.vue'), description: 'AI 驱动的可视化页面设计工作室' },
  '/skill-catalog':   { title: '组件目录',    icon: 'Notebook',     scope: 'platform',  source: 'src/views/app/SkillCatalog.vue',                 load: () => import('../views/app/SkillCatalog.vue'), description: 'SPARK 组件配置目录（Props / 能力 / 示例）' },
}

/**
 * 构建 componentMap（路径 → Vue 组件实例）。
 *
 * 在 main.ts 启动阶段调用，并行加载所有组件模块后返回扁平映射。
 */
export async function buildComponentMap(): Promise<Record<string, Component>> {
  const entries = Object.entries(VUE_PAGE_MAP)
  const modules = await Promise.all(
    entries.map(async ([path, entry]) => {
      const mod = await entry.load()
      return [path, mod.default] as const
    }),
  )
  return Object.fromEntries(modules)
}

/**
 * 平台级路径集合（用于路由守卫：未登录时只允许这些路径）。
 * 从 VUE_PAGE_MAP 中 scope='platform' 的条目自动派生，消除硬编码。
 */
export function getPlatformPaths(): Set<string> {
  return new Set(
    Object.entries(VUE_PAGE_MAP)
      .filter(([, entry]) => entry.scope === 'platform')
      .map(([path]) => path),
  )
}

/**
 * 从 VUE_PAGE_MAP platform 条目自动构建登录前导航树。
 *
 * 替代 main.ts 中硬编码的 preAuthNavTree，确保 platform 页面变更只需修改 VUE_PAGE_MAP。
 * 登录后 DynamicRouter.refreshRoutes() 会用远程导航树完全替换。
 */
export function buildPreAuthNavTree(): AppNavRoot {
  const children = Object.entries(VUE_PAGE_MAP)
    .filter(([, entry]) => entry.scope === 'platform')
    .map(([path, entry]) => ({
      id: `platform-${path === '/' ? 'home' : path.slice(1)}`,
      title: entry.title,
      ...(entry.icon !== undefined && { icon: entry.icon }),
      path,
      nodeKind: 'system-page' as const,
      ...(entry.hidden === true && { hidden: true }),
    }))

  return { title: '', childPlacement: 'header' as const, homePath: '/', children }
}

/**
 * 组件页面选项列表（纯元数据，不含组件引用）。
 *
 * 供编辑器 UI（如 DevNodeProps）作为下拉选项使用。
 */
export function getVuePageOptions(): Array<{ path: string; title: string; scope: PageScope; source: string; icon?: string; description?: string }> {
  return Object.entries(VUE_PAGE_MAP).map(([path, entry]) => ({
    path,
    title: entry.title,
    scope: entry.scope,
    source: entry.source,
    ...(entry.icon !== undefined && { icon: entry.icon }),
    ...(entry.description !== undefined && { description: entry.description }),
  }))
}
