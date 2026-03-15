/**
 * DynamicRouter 导航访问模块
 *
 * 提供对 DynamicRouter 实例的模块级访问，将导航基础设施从 AI 循环模块中解耦。
 * start.ts 在启动时通过 setDynamicRouter() 注入实例，后续通过导出函数读取。
 */
import type { NavRoot } from './nav-types'

/** DynamicRouter 公共 API 子集（仅导航相关） */
interface DynamicRouterAccess {
  refreshRoutes(): Promise<NavRoot | null>
  getNavTree(): NavRoot | null
}

/** 初始化选项 */
interface NavAccessOptions {
  /** 导航树未加载时的回退首页路径（默认 '/dashboard'） */
  defaultHomePath?: string
}

/** DynamicRouter 实例引用，由 start.ts 通过 setDynamicRouter 注入 */
let _dynamicRouter: DynamicRouterAccess | null = null
let _defaultHomePath = '/dashboard'

/** 注册 DynamicRouter 实例（start.ts 中调用） */
export function setDynamicRouter(router: DynamicRouterAccess, options?: NavAccessOptions): void {
  _dynamicRouter = router
  if (options?.defaultHomePath !== undefined) {
    _defaultHomePath = options.defaultHomePath
  }
}

/** 刷新动态路由（清缓存 + 重新注册），返回加载后的导航树 */
export async function refreshRoutes(): Promise<NavRoot | null> {
  if (!_dynamicRouter) return null
  return _dynamicRouter.refreshRoutes()
}

/** 获取 DynamicRouter 已加载的导航树（同步读取，不发起 HTTP 请求） */
export function getNavTree(): NavRoot | null {
  return _dynamicRouter?.getNavTree() ?? null
}

/** 获取导航树声明的应用首页路径（未设置时回退到配置的 defaultHomePath） */
export function getNavHomePath(): string {
  return _dynamicRouter?.getNavTree()?.homePath ?? _defaultHomePath
}
