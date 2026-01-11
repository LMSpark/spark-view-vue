import type { Rule as FormCreateRule } from '@form-create/element-ui'
import type { RouteRecordRaw } from 'vue-router'

/**
 * 页面规则类型（基于 form-create 的 Rule）
 * 扩展了 dataKey 和 contextId 属性用于数据绑定
 */
export interface PageRule extends FormCreateRule {
  dataKey?: string      // 数据绑定的 key，如 'dataset.tables.Users.rows'
  contextId?: string    // 上下文 ID，用于多视图绑定
}

/**
 * 重新导出 form-create 原始 Rule 类型
 */
export type { FormCreateRule }

/**
 * HTTP 方法类型（使用标准 HTTP 方法）
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

/**
 * API 配置（扩展 fetch RequestInit）
 */
export interface ApiConfig extends Partial<Pick<RequestInit, 'headers' | 'mode' | 'credentials'>> {
  url: string                       // API 地址
  method?: HttpMethod               // HTTP 方法
  params?: Record<string, unknown>  // 请求参数（GET: query, POST: body）
  dataPath?: string                 // 响应数据路径，如 'data.list'
  autoLoad?: boolean                // 是否自动加载，默认 true
}

/**
 * 数据源配置（支持静态数据或 API 配置）
 */
export type DataSource = Record<string, unknown | ApiConfig>

/**
 * 页面配置
 */
export interface PageConfig {
  rule: PageRule[]              // 页面规则（form-create Rule + 扩展属性）
  data: DataSource              // 可以是静态数据或包含 API 配置
  script?: string               // 页面脚本
  style?: string                // 页面样式
}

/**
 * 路由配置（扩展 vue-router 的 RouteRecordRaw）
 */
export interface RouteConfig extends Omit<RouteRecordRaw, 'component' | 'components'> {
  pageId: string                // 对应的页面配置 ID（必填）
  meta: RouteRecordRaw['meta'] & {
    title: string               // 页面标题（必填）
    icon?: string               // 页面图标
  }
}

/**
 * API 响应格式（泛型）
 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}
