/**
 * Rule 绑定 Composable
 */
import { Ref } from 'vue';
import type { Rule, FormCreateAPI } from '../types';
import type { IDataSet } from '@spark-view/spark-data';
export interface UseRuleBindingOptions {
    originalRules: Ref<Rule[]>;
    pageData: Record<string, unknown>;
    pageFunctions: Ref<Record<string, Function>>;
    dataSet: Ref<IDataSet | null>;
    formApi: Ref<FormCreateAPI | null>;
}
/**
 * Rule 数据绑定 Hook
 *
 * @example
 * ```typescript
 * const { boundRules, rebindRules } = useRuleBinding({
 *   originalRules,
 *   pageData,
 *   pageFunctions,
 *   dataSet,
 *   formApi
 * })
 *
 * // 数据变化时重新绑定
 * watch(pageData, () => {
 *   rebindRules()
 * })
 * ```
 */
export declare function useRuleBinding(options: UseRuleBindingOptions): {
    boundRules: Ref<import("@form-create/element-ui").Rule[], import("@form-create/element-ui").Rule[]>;
    rebindRules: () => void;
};
//# sourceMappingURL=useRuleBinding.d.ts.map