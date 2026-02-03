/**
 * CSS 作用域隔离工具
 */
/**
 * CSS 作用域选项
 */
export interface CssScopeOptions {
    pageId: string;
    css: string;
}
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
export declare function scopeCSS(options: CssScopeOptions): string;
/**
 * 创建作用域样式元素
 */
export declare function createScopedStyleElement(pageId: string, css: string): HTMLStyleElement | null;
/**
 * 移除页面样式
 */
export declare function removeScopedStyle(pageId: string): void;
//# sourceMappingURL=scopeCSS.d.ts.map