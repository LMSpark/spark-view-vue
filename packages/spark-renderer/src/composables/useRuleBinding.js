/**
 * Rule 绑定 Composable
 */
import { ref } from 'vue';
import { pageLogger } from '@spark-view/spark-app';
import { bindDataToRules } from '../utils/bindRules';
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
export function useRuleBinding(options) {
    const { originalRules, pageData, pageFunctions, dataSet, formApi } = options;
    const boundRules = ref([]);
    const rebindRules = () => {
        if (!originalRules.value || originalRules.value.length === 0) {
            boundRules.value = [];
            return;
        }
        boundRules.value = bindDataToRules({
            rules: originalRules.value,
            pageData,
            pageFunctions: pageFunctions.value,
            dataSet: dataSet.value,
            formApi: formApi.value
        });
        pageLogger.debug('Rules 重新绑定', { rulesCount: originalRules.value.length });
    };
    return {
        boundRules,
        rebindRules
    };
}
