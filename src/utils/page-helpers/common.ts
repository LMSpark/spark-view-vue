// 页面脚本公共模块 - 上下文访问器

import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { DataSetManager } from '@/models/dataSetManager'

/**
 * 页面上下文接口
 */
export interface PageContext {
  $api: any // form-create API 实例
  $route: RouteLocationNormalizedLoaded
  $data: Record<string, any>
  $el: HTMLElement | null
  $query: (selector: string) => Element | null
  $queryAll: (selector: string) => NodeListOf<Element>
  $refreshData: (key?: string) => Promise<void>
  $rebindRules: () => void
  $dataSet: DataSetManager | null
}

/**
 * 获取页面上下文对象
 */
const getContext = (): Partial<PageContext> => 
  (window as any).__pageContext || {}

/**
 * 获取 form-create API 实例
 */
export const $api = () => getContext().$api

/**
 * 获取 Vue Router 当前路由
 */
export const $route = () => getContext().$route

/**
 * 获取页面数据
 */
export const $data = () => getContext().$data

/**
 * 获取页面容器 DOM 元素
 */
export const $el = () => getContext().$el

/**
 * 查询单个 DOM 元素（在页面容器内）
 */
export const $query = (selector: string) => getContext().$query?.(selector)

/**
 * 查询所有匹配的 DOM 元素（在页面容器内）
 */
export const $queryAll = (selector: string) => getContext().$queryAll?.(selector)

/**
 * 刷新页面数据
 * @param key - 可选，指定要刷新的数据 key，不传则刷新所有 API 数据
 */
export const $refreshData = (key?: string) => getContext().$refreshData?.(key)

/**
 * 重新绑定数据到 rules（用于响应式数据更新后强制视图刷新）
 */
export const $rebindRules = () => getContext().$rebindRules?.()

/**
 * 获取 DataSet 实例（由 DynamicPage 自动创建）
 */
export const $dataSet = () => getContext().$dataSet
