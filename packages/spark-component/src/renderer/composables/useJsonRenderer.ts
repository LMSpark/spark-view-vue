/**
 * useJsonRenderer - JSON 配置渲染器 Composable
 *
 * 封装 JsonRenderer 的完整生命周期管理：
 * - 配置加载（远程 URL / 直接传入）
 * - SPARK 能力上下文（APP_SERVICES）
 * - 错误处理与状态管理
 * - 生命周期钩子调用
 *
 * JsonRenderer.vue 仅负责模板渲染和 defineProps / defineExpose 声明。
 *
 * @example
 * ```vue
 * <script setup>
 * const props = defineProps<JsonRendererOptions>()
 * const {
 *   loading, error, config,
 *   loadConfig, reload
 * } = useJsonRenderer(props)
 * </script>
 * ```
 */

import { ref, onMounted, watch, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { Logger, APP_SERVICES } from '@spark-view/spark-utils'
import { useSparkComponent } from '../../composables/useSparkComponent'
import { buildAppServices } from '../utils/provideAppServices'
import type { JsonRendererOptions } from '../types'

const logger = Logger('JsonRenderer')

// ─────────────────────────────────────────────
// 公共接口
// ─────────────────────────────────────────────

/** useJsonRenderer 返回值 */
export interface UseJsonRendererReturn {
  // 模板绑定
  loading: Ref<boolean>
  error: Ref<string>
  config: Ref<Record<string, unknown> | null>
  
  // defineExpose / 外部调用
  loadConfig: () => Promise<void>
  reload: () => Promise<void>
}

// ─────────────────────────────────────────────
// Composable 实现
// ─────────────────────────────────────────────

/**
 * JSON 配置渲染器 Composable
 *
 * @param props - JsonRendererOptions（来自 defineProps）
 */
export function useJsonRenderer(
  props: JsonRendererOptions
): UseJsonRendererReturn {
  // ==================== SPARK 能力上下文 ====================
  const router = useRouter()
  const { provide: provideCapability } = useSparkComponent({
    type: 'json-renderer',
    id: 'json-renderer-root'
  })

  provideCapability(APP_SERVICES, buildAppServices(router, logger))

  // ==================== 状态声明 ====================
  const loading = ref(true)
  const error = ref<string>('')
  const config = ref<Record<string, unknown> | null>(null)

  // ==================== 配置加载 ====================

/**
 * 从远程 URL 加载配置
 */
async function loadConfigFromUrl(url: string, options: JsonRendererOptions): Promise<Record<string, unknown>> {
    logger.info('加载配置:', url)
    
    // 调用 beforeLoad 钩子
    if (options.beforeLoad) {
      await options.beforeLoad(url)
    }
    
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      let configData = (await response.json()) as Record<string, unknown>
      
      // 调用 afterLoad 钩子（可能转换配置）
      if (options.afterLoad) {
        const result = await options.afterLoad(configData)
        if (result !== undefined) {
          configData = result
        }
      }
      
      return configData
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      logger.error('配置加载失败:', err)
      
      // 调用 onError 钩子
      if (options.onError) {
        options.onError(err)
      }
      
      throw err
    }
  }

  /**
   * 加载配置（主函数）
   */
  async function loadConfig(): Promise<void> {
    loading.value = true
    error.value = ''
    config.value = null
    
    try {
      // 优先使用直接传入的配置
      if (props.config) {
        logger.debug('使用传入的配置对象')
        config.value = props.config
        
        // 仍然调用 afterLoad 钩子
        if (props.afterLoad) {
          const result = await props.afterLoad(props.config)
          if (result !== undefined) {
            config.value = result
          }
        }
      }
      // 否则从 URL 加载
      else if (props.configUrl) {
        config.value = await loadConfigFromUrl(props.configUrl, props)
      }
      // 都没有提供
      else {
        throw new Error('必须提供 configUrl 或 config 参数')
      }
      
      loading.value = false
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      error.value = err.message
      loading.value = false
      
      // 调用 onError 钩子
      if (props.onError) {
        props.onError(err)
      }
    }
  }

  /**
   * 重新加载配置
   */
  async function reload(): Promise<void> {
    logger.info('重新加载配置')
    await loadConfig()
  }

  // ==================== 生命周期 ====================

  onMounted(() => {
    void loadConfig()
  })

  // 监听 props 变化，重新加载
  watch(
    () => [props.configUrl, props.config] as const,
    () => {
      void loadConfig()
    },
    { deep: true }
  )

  // ==================== 返回接口 ====================

  return {
    loading,
    error,
    config,
    loadConfig,
    reload
  }
}
