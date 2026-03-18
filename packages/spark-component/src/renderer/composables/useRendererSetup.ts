/**
 * useRendererSetup — 渲染器共享基础设施 Composable
 *
 * 提取自 usePageRenderer / SparkPageRenderer 等渲染器的公共模式：
 *   - SPARK 能力上下文（useSparkComponent + APP_SERVICES）
 *   - 加载状态机（loading / error + 竞态保护）
 *
 * 差异化逻辑（DataSet / CSS scope / 脚本沙箱 / fetch）
 * 保留在各自消费方中，通过 `runLoad` 的回调注入。
 *
 * @example
 * ```typescript
 * const { router, provideCapability, loading, error, runLoad }
 *   = useRendererSetup('page-renderer', pageLogger)
 *
 * async function load() {
 *   await runLoad(async (isStale) => {
 *     const data = await fetchSomething()
 *     if (isStale()) return  // 竞态：已被更新的请求取代
 *     applyData(data)
 *   }, props.onError)
 * }
 * ```
 */

import { ref, type Ref } from 'vue'
import { useRouter, type Router } from 'vue-router'
import { APP_SERVICES, type LoggerApi } from '@spark-view/spark-utils'
import { useSparkComponent, type UseSparkComponentReturn } from '../../composables/useSparkComponent'
import { PAGE_COMPONENT_REGISTRY } from '../../capability-keys'
import type { PageComponentRegistry } from '../../capability-keys'
import { buildAppServices } from '../utils/provideAppServices'
import { createPageComponentRegistry } from '../utils/page-component-registry'

// ─── 公共接口 ────────────────────────────────────────────────────────────────

export interface RendererSetupReturn {
  /** Vue Router 实例（消费方如 buildPageService / resolvePageId 可能需要） */
  router: Router
  /** SPARK 能力 provide 函数（含 CapabilityTypeMap 类型重载） */
  provideCapability: UseSparkComponentReturn['provide']
  /** 是否正在加载 */
  loading: Ref<boolean>
  /** 加载失败的错误消息（空字符串表示无错误） */
  error: Ref<string>
  /** 页面级组件注册中心（实例 + API） */
  componentRegistry: PageComponentRegistry
  /**
   * 带竞态保护的异步加载封装
   *
   * 每次调用递增序列号；如果在 `fn` 执行期间出现新的 `runLoad` 调用，
   * `isStale()` 返回 `true`，旧请求的结果会被静默丢弃。
   *
   * @param fn      实际加载逻辑；执行中可随时调用 `isStale()` 检查是否已过期
   * @param onError 错误回调（仅对未过期请求触发，通常传入 `props.onError`）
   */
  runLoad: (
    fn: (isStale: () => boolean) => Promise<void>,
    onError?: (err: Error) => void,
  ) => Promise<void>
}

// ─── Composable 实现 ─────────────────────────────────────────────────────────

/**
 * 渲染器共享基础设施 Composable
 *
 * @param componentType SPARK 组件类型标识（如 `'page-renderer'`、`'json-renderer'`）
 * @param logger        日志实例
 */
export function useRendererSetup(
  componentType: string,
  logger: LoggerApi,
): RendererSetupReturn {

  // ── SPARK 能力上下文 ──

  const router = useRouter()
  const { provide: provideCapability } = useSparkComponent({
    type: componentType,
    id: `${componentType}-root`,
  })
  const componentRegistry = createPageComponentRegistry()
  provideCapability(APP_SERVICES, buildAppServices(router, logger))
  provideCapability(PAGE_COMPONENT_REGISTRY, componentRegistry)

  // ── 加载状态机 ──

  const loading = ref(true)
  const error   = ref<string>('')

  /**
   * 竞态保护序列号。每次 runLoad 调用递增；
   * async 回调完成时检查序列号是否仍匹配当前请求。
   */
  let _loadSeqId = 0

  async function runLoad(
    fn: (isStale: () => boolean) => Promise<void>,
    onError?: (err: Error) => void,
  ): Promise<void> {
    const myId  = ++_loadSeqId
    const isStale = () => myId !== _loadSeqId

    loading.value = true
    error.value   = ''

    try {
      await fn(isStale)
    } catch (err) {
      if (isStale()) return
      const e = err instanceof Error ? err : new Error(String(err))
      error.value = e.message
      onError?.(e)
    } finally {
      if (!isStale()) loading.value = false
    }
  }

  return { router, provideCapability, loading, error, componentRegistry, runLoad }
}
