export interface PageRule {
  type: string
  class?: string
  style?: Record<string, any>
  props?: Record<string, any>
  field?: string
  title?: string
  value?: any
  options?: Array<{ label: string; value: any }>
  validate?: Array<any>
  children?: Array<PageRule | string>
  dataKey?: string  // 数据绑定的key
  on?: Record<string, string | Function>  // 事件处理器
}

// API 配置
export interface ApiConfig {
  url: string  // API 地址
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  params?: Record<string, any>  // 请求参数
  dataPath?: string  // 响应数据路径，如 'data.list'
  autoLoad?: boolean  // 是否自动加载，默认 true
}

// 数据源配置
export interface DataSource {
  [key: string]: any | ApiConfig  // 支持静态数据或 API 配置
}

export interface PageConfig {
  rule: PageRule[]
  data: DataSource  // 可以是静态数据或包含 API 配置
  script?: string
  style?: string
}

export interface RouteConfig {
  path: string
  name: string
  pageId: string  // 对应的页面配置ID（必填）
  meta: {
    title: string
    icon: string
  }
}

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}
