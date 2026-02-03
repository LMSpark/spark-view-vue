/**
 * SPARK Data Namespace
 * 提供统一的数据空间 API，简化消费层使用
 */
import { DataSet } from './dataset-impl.js';
import { DataTable } from './dataTable.js';
import { BindingContext } from './bindingContext.js';
import { TreeManager } from './treeManager.js';
import { DataSetManager } from './dataSetManager.js';
import { FilterExpressionParser } from './filterExpressionParser.js';
import type { IDataSet, DataRow, TreeConfig, FlatTreeNode } from './types.js';
/**
 * SparkData 命名空间
 * 统一数据空间操作入口
 */
export declare const SparkData: {
    /**
     * 创建 DataSet 实例
     * @example
     * const ds = SparkData.createDataSet({
     *   dataSetName: 'MyData',
     *   tables: { Users: { tableName: 'Users', columns: [], rows: [] } }
     * })
     */
    readonly createDataSet: (config: IDataSet, dataLoader?: ((tableName: string) => Promise<DataRow[]>) | undefined) => DataSet;
    /**
     * 从 JSON 创建 DataSet
     * @example
     * const ds = SparkData.fromJSON(jsonString, dataLoader)
     */
    readonly fromJSON: (json: string, dataLoader?: ((tableName: string) => Promise<DataRow[]>) | undefined) => DataSet;
    /**
     * 创建 TreeManager 实例
     * @example
     * const tree = SparkData.createTreeManager({
     *   idField: 'id',
     *   parentIdField: 'parentId',
     *   lazy: true
     * })
     */
    readonly createTreeManager: (config: TreeConfig, initialNodes?: FlatTreeNode[], bindingContext?: BindingContext) => TreeManager;
    /**
     * 从 JSON 恢复 TreeManager
     */
    readonly treeFromJSON: (json: string, bindingContext?: BindingContext) => TreeManager;
    /**
     * 创建 BindingContext 实例
     * @example
     * const ctx = SparkData.createContext('Users', 'default', dataSet)
     */
    readonly createContext: (hostTable: string, contextId?: string, dataSet?: IDataSet) => BindingContext;
    /**
     * 过滤表达式解析器（静态工具类）
     * @example
     * const filterFn = SparkData.FilterParser.toMemoryFilter(expression)
     * const sql = SparkData.FilterParser.toSQL(expression)
     */
    readonly FilterParser: typeof FilterExpressionParser;
    /**
     * 直接访问类构造器（高级用户）
     */
    readonly classes: {
        readonly DataSet: typeof DataSet;
        readonly DataTable: typeof DataTable;
        readonly BindingContext: typeof BindingContext;
        readonly TreeManager: typeof TreeManager;
        readonly DataSetManager: typeof DataSetManager;
        readonly FilterExpressionParser: typeof FilterExpressionParser;
    };
};
export default SparkData;
//# sourceMappingURL=spark-data-namespace.d.ts.map