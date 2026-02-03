/**
 * DataTable 类 - 数据表
 * 继承 BindingContext，实现 IDataTable 接口
 * 相当于 .NET 的 DataTable - 结构层
 */
import { BindingContext } from './bindingContext';
import type { IDataTable, DataColumn, CrudApi, IDataSet } from './types';
/**
 * 数据表类（实现 IDataTable 接口 + 方法逻辑）
 */
export declare class DataTable extends BindingContext implements IDataTable {
    tableName: string;
    columns: DataColumn[];
    api?: CrudApi;
    contexts: Record<string, BindingContext>;
    loading?: boolean;
    error?: string;
    constructor(tableName: string, columns?: DataColumn[], dataSet?: IDataSet);
    /**
     * 获取或创建上下文
     */
    getOrCreateContext(contextId: string): BindingContext;
    /**
     * 刷新所有上下文（重新应用过滤和排序）
     */
    refreshAllContexts(): void;
    /**
     * 转换为普通对象（用于序列化）
     */
    toPlainObject(): IDataTable;
    /**
     * 转换上下文为普通对象
     */
    private contextsToPlainObject;
    /**
     * 从普通对象创建实例
     */
    static fromPlainObject(data: IDataTable, dataSet?: IDataSet): DataTable;
}
//# sourceMappingURL=dataTable.d.ts.map