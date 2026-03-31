/**
 * 动态路由注册器 - 支持 SPA 动态路由
 *
 * 迁移自 spark-page-config/router，职责上属于应用引导层（spark-app），
 * spark-page-config 只保留纯 TS 的配置加载/解析能力。
 */

import type { Router, RouteRecordRaw } from 'vue-router'
import type { Component } from 'vue'
import type { ConfigLoader } from '@spark-view/spark-page-config'
import type { NavNode, AppNavRoot } from '@spark-view/spark-utils'
import { createLogger } from '../logger'
import { CrossProjectRefPage } from './cross-project-ref-page'
import { ExternalLinkFramePage } from './external-link-frame-page'

function isUnauthorizedError(error: unknown): boolean {
  if (error === null || error === undefined || typeof error !== 'object') return false
  const candidate = error as { status?: unknown; response?: { status?: unknown } }
  if (candidate.status === 401) return true
  if (candidate.response?.status === 401) return true
  return false
}

const routerLogger = createLogger('DynamicRouter')

function shouldLogDynamicRouteDetails(): boolean {
  if (typeof globalThis === 'undefined') return false
  const flag = (globalThis as Record<string, unknown>)['__SPARK_DEBUG_DYNAMIC_ROUTER__']
  return flag === true
}

/**
 * 动态路由注册选项
 */
export interface DynamicRouterOptions {
  /** Vue Router 实例 */
  router: Router

  /** 配置加载器 */
  configLoader: ConfigLoader

  /**
   * 动态页面组件（必需）
   * 用于渲染配置化页面
   *
   * @example
   * ```typescript
   * import { PageRenderer } from '@spark-view/spark-component'
   * const options = { router, configLoader, pageComponent: PageRenderer }
   * ```
   */
  pageComponent: Component

  /**
   * system-page 路径 → Vue 组件映射。
   * 导航节点 nodeKind='system-page' 时，使用此映射解析组件。
   */
  componentMap?: Record<string, Component>

  /**
   * 租户路径前缀（如 '/t/:tenantId'）。
   * 设置后，config 页面路由自动加此前缀，使所有业务路由统一在租户 URL 下。
   * system-page 路由不受影响（DB 中已含完整路径）。
   */
  tenantPathPrefix?: string

  /**
   * 导航数据加载函数 — 导航树作为路由的唯一来源。
   *
   * 已认证时 `registerRoutes()` 使用此函数加载远程导航树并派生路由。
   * 返回的 AppNavRoot 对象同时用于 UI 渲染（侧栏/顶栏菜单）。
   */
  loadNavigation?: (() => Promise<AppNavRoot>) | undefined

  /**
   * 登录前本地导航树 — 未认证时使用的静态导航数据。
   *
   * 当 `registerRoutes()` 在未登录状态调用时（无法调用 loadNavigation），
   * 使用此本地导航树注册路由（如 / 和 /login）。
   * 登录后 `refreshRoutes()` 会用远程导航树替换。
   */
  preAuthNavTree?: AppNavRoot | undefined

  /**
   * 认证状态检查回调。
   *
   * `registerRoutes()` 在运行时通过此回调判断当前状态：
   * - 已登录 → 使用 `loadNavigation` 加载远程导航树
   * - 未登录 → 使用 `preAuthNavTree` 本地导航树
   */
  isAuthenticated?: (() => boolean) | undefined
}

/**
 * 动态路由管理器
 */
export class DynamicRouter {
  private router: Router
  private configLoader: ConfigLoader
  private pageComponent: Component
  private registeredRoutes: Set<string> = new Set()
  /** path → Component 映射（system-page 路由使用） */
  private staticComponentMap: Map<string, Component> = new Map()
  /** 租户路径前缀（如 '/t/:tenantId'），config 路由自动加此前缀 */
  private tenantPathPrefix: string
  /** tenantPathPrefix 的实体路径匹配（如 '^/t/[^/]+'） */
  private tenantPathRegex: RegExp | null
  /** 导航数据加载函数（提供后从导航树派生路由） */
  private _loadNavigation: (() => Promise<AppNavRoot>) | undefined
  /** 登录前本地导航树 */
  private _preAuthNavTree: AppNavRoot | null = null
  /** 认证状态检查回调 */
  private _isAuthenticated: () => boolean
  /** 已加载的导航树（UI 侧栏/顶栏共享此数据） */
  private _navTree: AppNavRoot | null = null
  /** NavNode → 注册路由路径追踪（弱引用，导航树刷新后自动 GC） */
  private _navRouteMap = new WeakMap<NavNode, string>()

  constructor(options: DynamicRouterOptions) {
    this.router = options.router
    this.configLoader = options.configLoader

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- pageComponent 结构可缺失
    if (options.pageComponent === undefined || options.pageComponent === null) {
      throw new Error('DynamicRouter: pageComponent 是必需的，请提供有效的 Vue 组件')
    }

    this.pageComponent = options.pageComponent
    this.tenantPathPrefix = options.tenantPathPrefix ?? ''
    this.tenantPathRegex = this.tenantPathPrefix
      ? this.createTenantPathRegex(this.tenantPathPrefix)
      : null

    // 导航加载函数（统一数据源）
    this._loadNavigation = options.loadNavigation
    this._preAuthNavTree = options.preAuthNavTree ?? null
    this._isAuthenticated = options.isAuthenticated ?? (() => true)

    // 构建 path → Component 映射
    if (options.componentMap) {
      for (const [path, comp] of Object.entries(options.componentMap)) {
        this.staticComponentMap.set(this.normalizePath(path), comp)
      }
    }
  }

  private normalizePath(path: string): string {
    const trimmed = path.trim()
    if (trimmed === '') return '/'
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
    if (withLeadingSlash.length === 1) return withLeadingSlash
    return withLeadingSlash.replace(/\/+$/, '')
  }

  private createTenantPathRegex(prefix: string): RegExp {
    const escaped = prefix
      .split('/')
      .filter(Boolean)
      .map(segment => segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('/')
    return new RegExp(`^/${escaped}(?=/|$)`)
  }

  private addTenantPrefix(path: string): string {
    const normalizedPath = this.normalizePath(path)
    if (!this.tenantPathPrefix) return normalizedPath
    if (normalizedPath.startsWith(this.tenantPathPrefix)) return normalizedPath
    if (this.tenantPathRegex?.test(normalizedPath)) return normalizedPath
    return this.normalizePath(`${this.tenantPathPrefix}${normalizedPath}`)
  }

  private buildScopedRefPath(path: string, targetProjectId: string): string {
    const normalizedPath = this.normalizePath(path)
    if (!this.tenantPathPrefix) return normalizedPath

    const segments = this.tenantPathPrefix.split('/').filter(Boolean)
    const resolvedSegments = segments.map((segment) => {
      if (segment === ':tenantId') return ':tenantId'
      if (segment === ':projectId') return targetProjectId
      return segment
    })

    return this.normalizePath(`/${resolvedSegments.join('/')}${normalizedPath}`)
  }

  private resolveCrossProjectRefUrl(node: NavNode): string | null {
    const targetProjectId = typeof node.refProjectId === 'string' ? node.refProjectId.trim() : ''
    const refPath = typeof node.refPath === 'string' ? node.refPath.trim() : ''
    if (targetProjectId === '' || refPath === '') return null

    const match = /^@app:[^/]+(\/.*)?$/.exec(refPath)
    const targetPath = match?.[1]
    if (targetPath === undefined || targetPath.trim() === '') return null

    return this.buildScopedRefPath(targetPath, targetProjectId)
  }

  private resolveCrossProjectRefPageId(node: NavNode): string | null {
    const refPath = typeof node.refPath === 'string' ? node.refPath.trim() : ''
    if (refPath === '') return null

    const match = /^@app:[^/]+(\/.*)?$/.exec(refPath)
    const targetPath = (match?.[1] ?? refPath).split('#', 1)[0]?.split('?', 1)[0] ?? ''
    const pageId = targetPath.replace(/^\/+/, '').replace(/\/+$/, '')
    return pageId === '' ? null : pageId
  }

  private resolveCrossProjectRefHostPath(node: NavNode): string | null {
    const refUrl = this.resolveCrossProjectRefUrl(node)
    if (refUrl === null) return null

    const nodePath = typeof node.path === 'string' ? node.path.trim() : ''
    if (nodePath !== '') return nodePath

    return `/__ref/${encodeURIComponent(node.id)}`
  }

  private resolvePageId(node: NavNode, rawNodePath: string): string {
    const normalizedPath = this.normalizePath(rawNodePath)
    const slug = normalizedPath.replace(/^\/+/, '').replace(/\/+$/, '')
    const isConfigLikeNode =
      node.nodeKind !== 'system-page' &&
      node.nodeKind !== 'system-action' &&
      node.nodeKind !== 'link'

    if (isConfigLikeNode && slug !== '' && !slug.includes('/')) {
      return slug
    }

    return node.id
  }

  /** 注册所有路由（从导航树派生） */
  async registerRoutes(): Promise<void> {
    routerLogger.info('开始注册动态路由')

    // 平台级静态页面（about / hidden demos 等）始终保留，
    // 避免登录后 refreshRoutes() 仅保留远程导航树时把这些本地路由冲掉。
    if (this._preAuthNavTree) {
      this.registerRoutesFromNav(this._preAuthNavTree.children, true)
    }

    if (this._loadNavigation && this._isAuthenticated()) {
      try {
        await this.loadAndRegisterFromNav()
      } catch (error: unknown) {
        if (isUnauthorizedError(error) && this._preAuthNavTree) {
          routerLogger.warn('远程导航加载返回 401，回退到 preAuthNavTree', {
            reason: 'unauthorized',
            fallbackNodeCount: this._preAuthNavTree.children.length,
          })
          this._navTree = this._preAuthNavTree
          this._navRouteMap = new WeakMap()
          this.registerRoutesFromNav(this._preAuthNavTree.children, true)
        } else {
          throw error
        }
      }
    } else if (this._preAuthNavTree) {
      // 未登录状态：平台级路由已在上方注册；此处仅设置导航树上下文。
      this._navTree = this._preAuthNavTree
      this._navRouteMap = new WeakMap()
      routerLogger.info('预认证导航树路由注册完成', { nodeCount: this._preAuthNavTree.children.length })
    }

    routerLogger.info('动态路由注册完成', { count: this.registeredRoutes.size })
  }

  /** 从导航树加载并注册路由 */
  private async loadAndRegisterFromNav(): Promise<void> {
    if (!this._loadNavigation) {
      throw new Error('[DynamicRouter] _loadNavigation not set')
    }
    const navRoot = await this._loadNavigation()
    this._navTree = navRoot
    this._navRouteMap = new WeakMap()
    this.registerRoutesFromNav(navRoot.children)
    routerLogger.info('导航树路由注册完成', { nodeCount: navRoot.children.length })
  }

  /**
   * 历史数据平滑迁移（递归）
   *
   * 将旧格式中 nodeKind='system-page' 且 path 不以 `/` 开头的节点诺认为 system-action。
   * 旧格式编了 system-page 用于同时表示“Vue 组件路由”和“toolbar 动作按钮”两种语义。
   */
  /**
   * 从导航节点树递归注册路由
   * - nodeKind='link' + linkTarget='iframe' → 内嵌 iframe 路由（path 为外部 URL）
   * - nodeKind='link' + linkTarget='new-tab' → 不注册路由（点击时 window.open）
   * - nodeKind='system-action' → 不注册路由（动作按钮，由 AppHeader 处理）
   * - nodeKind='system-page' 或路径命中 componentMap → 静态组件路由
   * - 其他页面类节点 → pageComponent (PageRenderer)
   * @param skipTenantPrefix 平台级路由（preAuthNavTree）跳过租户前缀
   */
  private registerRoutesFromNav(nodes: NavNode[], skipTenantPrefix = false): void {
    for (const node of nodes) {
      const isLinkNode = node.nodeKind === 'link'
      const isRefNode = node.nodeKind === 'ref'
      const isSelfNode = isLinkNode && node.linkTarget === 'self'
      const isIframeNode = isLinkNode && node.linkTarget !== 'new-tab' && !isSelfNode
      const crossProjectRefUrl = isRefNode ? this.resolveCrossProjectRefUrl(node) : null
      const crossProjectRefHostPath = isRefNode ? this.resolveCrossProjectRefHostPath(node) : null
      const isCrossProjectRefNode = crossProjectRefUrl !== null && crossProjectRefHostPath !== null
      const isNewTabNode = isLinkNode && node.linkTarget === 'new-tab'
      const isActionNode = node.nodeKind === 'system-action'
      const nodePath = typeof node.path === 'string' ? node.path.trim() : ''
      const rawNodePath = nodePath !== ''
        ? node.path as string
        : isIframeNode
          ? `/__link/${encodeURIComponent(node.id)}`
          : (crossProjectRefHostPath ?? '')

      // new-tab / self / system-action 节点不注册路由
      if (isNewTabNode || isSelfNode || isActionNode || rawNodePath === '') {
        // 仍然递归子节点
        if (node.children?.length) {
          this.registerRoutesFromNav(node.children, skipTenantPrefix)
        }
        continue
      }

      const relativePath = this.normalizePath(rawNodePath)
      const component = this.staticComponentMap.get(relativePath)
      const useStaticComponent = node.nodeKind === 'system-page' || component !== undefined
      const pageId = this.resolvePageId(node, rawNodePath)
      // 平台级路由（preAuth）不加前缀，远程导航树路由统一加租户前缀
      const routePath = skipTenantPrefix
        ? this.normalizePath(rawNodePath)
        : this.addTenantPrefix(rawNodePath)

      if (this.registeredRoutes.has(routePath)) {
        if (shouldLogDynamicRouteDetails()) {
          routerLogger.debug(`路由已注册，跳过: ${routePath}`)
        }
      } else if (isIframeNode || isCrossProjectRefNode) {
        const externalUrl = isIframeNode
          ? nodePath
          : crossProjectRefUrl
        if (externalUrl === null) {
          if (node.children?.length) {
            this.registerRoutesFromNav(node.children, skipTenantPrefix)
          }
          continue
        }
        const route: RouteRecordRaw = isCrossProjectRefNode
          ? {
              path: routePath,
              name: `nav-${node.id}`,
              component: CrossProjectRefPage,
              props: { configLoader: this.configLoader },
              meta: {
                type: 'cross-project-ref',
                pageId,
                title: node.title,
                ...(node.description !== undefined && { description: node.description }),
                refPath: node.refPath,
                ...(node.refProjectId !== undefined && { refProjectId: node.refProjectId }),
                ...(this.resolveCrossProjectRefPageId(node) !== null && { refPageId: this.resolveCrossProjectRefPageId(node) }),
                ...(node.icon !== undefined && { icon: node.icon }),
                ...(node.permissionMode !== undefined && { permissionMode: node.permissionMode }),
              },
            }
          : {
              path: routePath,
              name: `nav-${node.id}`,
              component: ExternalLinkFramePage,
              meta: {
                type: 'external-link',
                pageId,
                title: node.title,
                ...(node.description !== undefined && { description: node.description }),
                externalUrl,
                ...(node.icon !== undefined && { icon: node.icon }),
                ...(node.permissionMode !== undefined && { permissionMode: node.permissionMode }),
              },
            }
        this.router.addRoute(route)
        this.registeredRoutes.add(routePath)
        if (shouldLogDynamicRouteDetails()) {
          routerLogger.debug(`${isCrossProjectRefNode ? '跨项目引用' : '链接 iframe'} 路由已注册(nav): ${routePath}`)
        }
      } else if (useStaticComponent && component !== undefined) {
          const route: RouteRecordRaw = {
            path: routePath,
            name: `nav-${node.id}`,
            component,
            meta: {
              type: 'system-page',
              pageId,
              title: node.title,
              ...(node.description !== undefined && { description: node.description }),
              ...(node.icon !== undefined && { icon: node.icon }),
              ...(node.permissionMode !== undefined && { permissionMode: node.permissionMode }),
            },
          }
          this.router.addRoute(route)
          this.registeredRoutes.add(routePath)
          if (shouldLogDynamicRouteDetails()) {
            routerLogger.debug(`Vue 组件路由已注册(nav): ${routePath}`)
          }
      } else {
        if (node.nodeKind === 'system-page') {
          routerLogger.debug('system-page 节点无 componentMap 映射，使用 PageRenderer', { path: node.path, nodeId: node.id })
        }
        // config 页面 → PageRenderer
        const route: RouteRecordRaw = {
          path: routePath,
          name: `nav-${node.id}`,
          component: this.pageComponent,
          props: { configLoader: this.configLoader },
          meta: {
            pageId,
            title: node.title,
            ...(node.description !== undefined && { description: node.description }),
            ...(node.icon !== undefined && { icon: node.icon }),
            ...(node.permissionMode !== undefined && { permissionMode: node.permissionMode }),
          },
        }
        this.router.addRoute(route)
        this.registeredRoutes.add(routePath)
        if (shouldLogDynamicRouteDetails()) {
          routerLogger.debug(`配置页面路由已注册(nav): ${routePath}`, { pageId })
        }
      }

      // WeakMap 追踪：导航节点 → 路由路径
      this._navRouteMap.set(node, routePath)

      // 递归子节点
      if (node.children?.length) {
        this.registerRoutesFromNav(node.children, skipTenantPrefix)
      }
    }
  }

  /** 移除路由 */
  removeRoute(name: string): void {
    const route = this.router.getRoutes().find(r => r.name === name)
    if (route) this.registeredRoutes.delete(route.path)
    this.router.removeRoute(name)
    if (shouldLogDynamicRouteDetails()) {
      routerLogger.debug('路由已移除', { name })
    }
  }

  /** 刷新路由（重新加载导航树，保留静态组件映射），返回加载后的导航树 */
  async refreshRoutes(): Promise<AppNavRoot | null> {
    routerLogger.info('刷新动态路由')

    // 保存旧路由集合；先注册新路由再删除旧路由，避免 Vue Router 内部
    // removeRoute() 触发重导航时因新路由尚未就绪而产生 "No match found" 警告。
    const prevRoutes = new Set(this.registeredRoutes)
    this.registeredRoutes.clear()

    try {
      await this.registerRoutes()
    } catch (error) {
      // 注册失败：回退到预认证导航树，确保至少有 login/home 路由可用
      routerLogger.error('路由注册失败，回退到预认证导航树', { error: String(error) })
      if (this._preAuthNavTree) {
        this._navTree = this._preAuthNavTree
        this._navRouteMap = new WeakMap()
        this.registerRoutesFromNav(this._preAuthNavTree.children, true)
      }
      throw error
    }

    // 移除新路由集合中不再存在的旧路由（此时新路由已全部就绪）
    for (const path of prevRoutes) {
      if (!this.registeredRoutes.has(path)) {
        const route = this.router.getRoutes().find(r => r.path === path)
        if (route?.name !== undefined) {
          this.router.removeRoute(route.name)
        }
      }
    }

    routerLogger.info('路由刷新完成')
    return this._navTree
  }

  /** 获取已加载的导航树（导航模式下可用） */
  getNavTree(): AppNavRoot | null {
    return this._navTree
  }

  /** 获取已注册路由列表 */
  getRegisteredRoutes(): string[] {
    return Array.from(this.registeredRoutes)
  }
}

/** 创建动态路由管理器 */
export function createDynamicRouter(options: DynamicRouterOptions): DynamicRouter {
  return new DynamicRouter(options)
}
