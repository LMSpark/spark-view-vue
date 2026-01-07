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

export interface PageConfig {
  rule: PageRule[]
  data: Record<string, any>
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
