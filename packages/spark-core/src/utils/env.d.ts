/**
 * SSR 兼容性工具
 * 提供安全的浏览器 API 访问，在 SSR 环境中返回安全默认值
 */
/**
 * 安全获取 window 对象
 * 在 SSR 环境中返回 undefined
 */
export declare function getWindow(): Window | undefined;
/**
 * 安全获取 document 对象
 * 在 SSR 环境中返回 undefined
 */
export declare function getDocument(): Document | undefined;
/**
 * 检查是否在浏览器环境中
 */
export declare function isBrowser(): boolean;
/**
 * 检查是否在服务器环境中
 */
export declare function isServer(): boolean;
/**
 * 安全的 window 属性访问
 * 在 SSR 环境中返回默认值
 */
export declare function getWindowProperty<T>(property: keyof Window, defaultValue: T): T;
/**
 * 安全的 document 属性访问
 * 在 SSR 环境中返回默认值
 */
export declare function getDocumentProperty<T>(property: keyof Document, defaultValue: T): T;
//# sourceMappingURL=env.d.ts.map