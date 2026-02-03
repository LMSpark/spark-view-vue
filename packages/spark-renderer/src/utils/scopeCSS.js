/**
 * CSS 作用域隔离工具
 */
/**
 * 为 CSS 添加作用域前缀
 *
 * @example
 * ```typescript
 * const scopedCss = scopeCSS({
 *   pageId: 'home',
 *   css: '.button { color: red; }'
 * })
 * // 结果: [data-page="home"].spark-page-container .button { color: red; }
 * ```
 */
export function scopeCSS(options) {
    const { pageId, css } = options;
    if (!css)
        return '';
    // 为每个 CSS 规则添加属性选择器前缀
    return css.replace(/([^{}]+)\{([^}]*)\}/g, (match, selector, rules) => {
        // 跳过 @media, @keyframes 等 at-rules
        if (selector.trim().startsWith('@')) {
            return match;
        }
        // 分割多个选择器（如 .a, .b { }）
        const selectors = selector.split(',').map((s) => {
            const trimmed = s.trim();
            // 如果已经有 data-page 前缀，跳过
            if (trimmed.includes('[data-page')) {
                return trimmed;
            }
            // 增强隔离：同时使用 data-page 属性和类名，提高优先级
            // 方案1: [data-page="xxx"].spark-page-container selector
            // 方案2: .spark-page-xxx selector (更简洁)
            // 这里使用方案1，因为更明确
            return `[data-page="${pageId}"].spark-page-container ${trimmed}`;
        });
        return `${selectors.join(', ')} {${rules}}`;
    });
}
/**
 * 创建作用域样式元素
 */
export function createScopedStyleElement(pageId, css) {
    if (typeof document === 'undefined')
        return null;
    const style = document.createElement('style');
    style.setAttribute('data-page-style', pageId);
    style.textContent = scopeCSS({ pageId, css });
    return style;
}
/**
 * 移除页面样式
 */
export function removeScopedStyle(pageId) {
    if (typeof document === 'undefined')
        return;
    const styles = document.querySelectorAll(`style[data-page-style="${pageId}"]`);
    styles.forEach(style => style.remove());
}
