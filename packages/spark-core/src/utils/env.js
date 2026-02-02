/**
 * SSR 兼容性工具
 * 提供安全的浏览器 API 访问，在 SSR 环境中返回安全默认值
 */
/**
 * 安全获取 window 对象
 * 在 SSR 环境中返回 undefined
 */
export function getWindow() {
    return typeof window !== 'undefined' ? window : undefined;
}
/**
 * 安全获取 document 对象
 * 在 SSR 环境中返回 undefined
 */
export function getDocument() {
    return typeof document !== 'undefined' ? document : undefined;
}
/**
 * 检查是否在浏览器环境中
 */
export function isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}
/**
 * 检查是否在服务器环境中
 */
export function isServer() {
    return !isBrowser();
}
/**
 * 安全的 window 属性访问
 * 在 SSR 环境中返回默认值
 */
export function getWindowProperty(property, defaultValue) {
    const win = getWindow();
    return win ? win[property] : defaultValue;
}
/**
 * 安全的 document 属性访问
 * 在 SSR 环境中返回默认值
 */
export function getDocumentProperty(property, defaultValue) {
    const doc = getDocument();
    return doc ? doc[property] : defaultValue;
}
