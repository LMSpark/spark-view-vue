// 页面脚本公共模块 - 上下文访问器

/**
 * 获取页面上下文对象
 * @returns {Object} 上下文对象，包含 $api, $route, $data, $el, $query, $queryAll
 */
const getContext = () => window.__pageContext || {}

/**
 * 获取 form-create API 实例
 * @returns {Object} form-create API
 */
export const $api = () => getContext().$api

/**
 * 获取 Vue Router 当前路由
 * @returns {Object} 路由对象
 */
export const $route = () => getContext().$route

/**
 * 获取页面数据
 * @returns {Object} 页面数据对象
 */
export const $data = () => getContext().$data

/**
 * 获取页面容器 DOM 元素
 * @returns {HTMLElement} 页面容器元素
 */
export const $el = () => getContext().$el

/**
 * 查询单个 DOM 元素（在页面容器内）
 * @param {string} selector - CSS 选择器
 * @returns {Element} DOM 元素
 */
export const $query = (selector) => getContext().$query?.(selector)

/**
 * 查询所有匹配的 DOM 元素（在页面容器内）
 * @param {string} selector - CSS 选择器
 * @returns {NodeList} DOM 元素列表
 */
export const $queryAll = (selector) => getContext().$queryAll?.(selector)

/**
 * 刷新页面数据
 * @param {string} [key] - 可选，指定要刷新的数据 key，不传则刷新所有 API 数据
 * @returns {Promise<void>}
 */
export const $refreshData = (key) => getContext().$refreshData?.(key)

/**
 * 重新绑定数据到 rules（用于响应式数据更新后强制视图刷新）
 * @returns {void}
 */
export const $rebindRules = () => getContext().$rebindRules?.()
