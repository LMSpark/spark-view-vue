/**
 * CSS 作用域 Composable
 */
export interface UseCssScopeOptions {
    pageId: string;
    enableScope?: boolean;
}
/**
 * CSS 作用域隔离 Hook
 *
 * @example
 * ```vue
 * <script setup>
 * const { scopedCss, setScopedCss } = useCssScope({ pageId: 'home' })
 *
 * onMounted(() => {
 *   setScopedCss('.button { color: red; }')
 * })
 * </script>
 *
 * <template>
 *   <component :is="'style'" v-if="scopedCss">{{ scopedCss }}</component>
 * </template>
 * ```
 */
export declare function useCssScope(options: UseCssScopeOptions): {
    scopedCss: import("vue").Ref<string, string>;
    setScopedCss: (css: string) => void;
};
//# sourceMappingURL=useCssScope.d.ts.map