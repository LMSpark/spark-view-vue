/**
 * DataSet 管理 Composable
 */
import { Ref } from 'vue';
import type { IDataSet, DataRow } from '@spark-view/spark-data';
import type { PageContext, Rule, FormCreateAPI } from '../types';
/**
 * DataSet管理选项接口 (ISP: 接口隔离原则)
 */
export interface UsePageDataSetOptions {
    pageData: Record<string, unknown>;
    context: PageContext;
    originalRules?: Ref<Rule[]>;
    formApi?: Ref<FormCreateAPI | null>;
    enableDataSet?: boolean;
    dataLoader?: (tableName: string) => Promise<DataRow[]>;
}
/**
 * DataSet管理返回值接口 (ISP: 接口隔离原则)
 */
export interface UsePageDataSetReturn {
    dataSet: Ref<IDataSet | null>;
    initDataSet: () => void;
    autoSubscribeTables: () => void;
    clearDataSet: () => void;
}
/**
 * DataSet 管理 Hook
 *
 * @example
 * ```typescript
 * const { dataSet, initDataSet, autoSubscribeTables } = usePageDataSet({
 *   pageData,
 *   context,
 *   originalRules
 * })
 *
 * initDataSet()
 * autoSubscribeTables()
 * ```
 */
export declare function usePageDataSet(options: UsePageDataSetOptions): UsePageDataSetReturn;
//# sourceMappingURL=usePageDataSet.d.ts.map