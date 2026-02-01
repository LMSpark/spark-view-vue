/**
 * 页面脚本上下文访问器
 * 提供对页面数据、API、路由等的访问
 */

/**
 * 获取 form-create API 实例
 * @returns {object|null} API 实例
 */
export function $api() {
  return window.__pageContext?.$api || window.__formApi__ || null
}

/**
 * 获取当前路由
 * @returns {object} 路由对象
 */
export function $route() {
  return window.__pageContext?.$route
}

/**
 * 获取页面数据（响应式）
 * @returns {object} 页面数据
 */
export function $data() {
  return window.__pageContext?.$data
}

/**
 * 获取页面容器元素
 * @returns {HTMLElement|null} 容器元素
 */
export function $el() {
  return window.__pageContext?.$el
}

/**
 * 查询单个DOM元素
 * @param {string} selector CSS选择器
 * @returns {Element|null}
 */
export function $query(selector) {
  return window.__pageContext?.$query?.(selector) || null
}

/**
 * 查询所有匹配的DOM元素
 * @param {string} selector CSS选择器
 * @returns {NodeList}
 */
export function $queryAll(selector) {
  return window.__pageContext?.$queryAll?.(selector) || document.querySelectorAll('')
}

/**
 * 获取 DataSet 实例
 * @returns {object|null} DataSet 实例
 */
export function $dataSet() {
  return window.__pageContext?.$dataSet || null
}

/**
 * 重新绑定数据到 rules
 * 当修改 pageData 后需要更新 UI 时调用
 * @param {boolean} forceUpdate 是否强制更新
 */
export function $rebindRules(forceUpdate = false) {
  const rebind = window.__pageContext?.$rebindRules
  if (typeof rebind === 'function') {
    rebind(forceUpdate)
  }
}

/**
 * 刷新 API 数据
 * @param {string} [key] 可选的 API 数据键
 * @returns {Promise<void>}
 */
export function $refreshData(key) {
  const refresh = window.__pageContext?.$refreshData
  if (typeof refresh === 'function') {
    return refresh(key)
  }
  return Promise.resolve()
}
