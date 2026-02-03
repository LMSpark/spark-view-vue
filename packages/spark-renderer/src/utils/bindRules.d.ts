/**
 * Rule 数据绑定工具
 */
import type { Rule, RuleBindingOptions, FormCreateAPI } from '../types';
import type { DataRow } from '@spark-view/spark-data';
/**
 * 递归替换 rule 中的数据占位符和事件处理器
 */
export declare function bindDataToRules(options: RuleBindingOptions): Rule[];
/**
 * 查找具有特定 dataKey 的 rule
 */
export declare function findRuleByDataKey(rules: Rule[], dataKey: string): Rule | null;
/**
 * 同步 DataSet 选中状态到 el-table
 */
export declare function syncSelectedRowsToTable(tableName: string, contextId: string, rows: DataRow[], formApi: FormCreateAPI | null): void;
//# sourceMappingURL=bindRules.d.ts.map