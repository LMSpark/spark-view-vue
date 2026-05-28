import { useRoute, useRouter } from 'vue-router'
import { buildTenantPath, parseTenantScope } from '@/services/tenant-scope'

/**
 * 租户路由工具 composable
 *
 * 所有路径操作都基于 /t/:tenantId/:projectId/... 格式，
 * 不支持裸路径回退。
 */
export function useTenantRouter() {
  const route = useRoute()
  const router = useRouter()

  /** 当前租户上下文（从路由参数提取） */
  function getTenantScope(): { tenantId: string; projectId: string } {
    const scope = parseTenantScope(route.path)
    if (!scope) {
      throw new Error(`仅支持租户作用域路由：期望 /t/{tenantId}/{projectId}，当前为 ${route.path}`)
    }
    return scope
  }

  /** 将相对路径转化为租户前缀完整路径 */
  function tenantPath(relativePath: string): string {
    return buildTenantPath(getTenantScope(), relativePath)
  }

  /** 确保页面路由已注册（租户前缀模式） */
  function ensureRouteExists(pid: string, namePrefix = 'page') {
    const tenantPrefixed = `/t/:tenantId/:projectId/${pid}`
    const exists = router.getRoutes().some((r) => r.path === tenantPrefixed)
    if (!exists) {
      throw new Error(`页面路由尚未由导航树注册: ${namePrefix}-${pid}`)
    }
  }

  /** 导航到页面（自动注册路由 + 租户前缀跳转） */
  function navigateToPage(pid: string, namePrefix = 'page') {
    ensureRouteExists(pid, namePrefix)
    void router.push(tenantPath(`/${pid}`))
  }

  return {
    route,
    router,
    getTenantScope,
    tenantPath,
    ensureRouteExists,
    navigateToPage,
  }
}
