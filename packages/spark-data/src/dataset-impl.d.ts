/**
 * DataSet 类 - 领域逻辑
 * 负责：数据表、关系、CRUD 操作、级联更新/删除
 */
import type { IDataSet, IBindingContext, DataRelation, DataRow, DependencyType, FilterExpression } from './types';
import { DataTable } from './dataTable';
import { BindingContext } from './bindingContext';
/**
 * DataSet 类（实现 IDataSet 接口 + 方法逻辑）
 * 相当于 .NET 的 DataSet - 领域逻辑层
 */
export declare class DataSet implements IDataSet {
    dataSetName: string;
    tables: Record<string, DataTable>;
    relations?: DataRelation[];
    version?: number;
    pageId?: string;
    autoLoadRelations?: boolean;
    private eventListeners;
    private contextSubscribers;
    dataLoader?: (tableName: string) => Promise<DataRow[]>;
    private loadingTables;
    constructor(config: IDataSet, dataLoader?: (tableName: string) => Promise<DataRow[]>);
    /**
     * 更新上下文的 rows（委托给 BindingContext）
     */
    private updateContextRows;
    /**
     * 获取表
     */
    getTable(tableName: string): DataTable | undefined;
    /**
     * 添加数据行
     */
    addRow(tableName: string, row: DataRow): boolean;
    /**
     * 更新数据行
     */
    updateRow(tableName: string, rowIndex: number, row: DataRow): boolean;
    /**
     * 删除数据行
     */
    deleteRow(tableName: string, rowIndex: number): boolean;
    /**
     * 级联更新
     * 当父表行更新时，同步更新子表中匹配行的外键字段
     */
    cascadeUpdate(tableName: string, row: DataRow, oldValues?: DataRow): string[];
    /**
     * 级联删除
     * 当父表行删除时，自动删除子表中所有关联的行
     */
    cascadeDelete(tableName: string, row: DataRow): string[];
    /**
     * 从 FilterExpression 提取外键字段映射
     */
    private extractForeignKeyMap;
    /**
     * 根据依赖类型获取父数据范围
     */
    getParentRows(parentContext: BindingContext | IBindingContext, dependencyType: DependencyType): DataRow[] | undefined;
    /**
     * 过滤子表数据
     */
    filterChildRows(childRows: DataRow[], filterExpression: FilterExpression, parentRows: DataRow[], _parentContext: BindingContext | IBindingContext): DataRow[];
    /**
     * 数组去重
     */
    private uniqueRows;
    /**
     * 应用数据关系（根据父表状态过滤子表）
     * @param relation 关系定义
     * @returns 是否发生了数据变化
     */
    applyRelation(relation: DataRelation): {
        changed: boolean;
        message: string;
    };
    /**
     * 比较两个数据集是否相等（静态工具方法）
     */
    static areRowsEqual(rows1: DataRow[], rows2: DataRow[]): boolean;
    /**
     * 比较两个数据集是否相等（实例方法）
     */
    private areRowsEqual;
    /**
     * 获取表的所有父依赖（递归）
     * @param tableName 表名
     * @returns 父表名称集合（从根到直接父表）
     */
    getTableDependencies(tableName: string): Set<string>;
    /**
     * 获取根依赖表（没有父表的表）
     * @param tableName 表名
     * @returns 根表名称集合
     */
    getRootDependencies(tableName: string): Set<string>;
    /**
     * 检查表的依赖条件是否满足
     * @param tableName 表名
     * @returns 依赖条件是否满足
     */
    areDependenciesSatisfied(tableName: string): boolean;
    /**
     * 导出为 JSON
     */
    toJSON(): string;
    /**
     * 从 JSON 加载
     */
    static fromJSON(json: string, dataLoader?: (tableName: string) => Promise<DataRow[]>): DataSet;
    /**
     * 事件监听
     */
    on(event: string, callback: Function): void;
    /**
     * 移除事件监听
     */
    off(event: string, callback: Function): void;
    /**
     * 触发事件
     */
    emit(event: string, data: unknown): void;
    /**
     * 订阅上下文数据变化
     * @param tableName 表名
     * @param contextId 上下文ID，默认 'default'
     * @param callback 回调函数
     */
    subscribe(tableName: string, contextId: string | undefined, callback: Function): () => void;
    /**
     * 通知订阅者数据变化
     * @param tableName 表名
     * @param contextId 上下文ID，如果未指定则通知所有上下文
     */
    notifySubscribers(tableName: string, contextId?: string): void;
    /**
     * 获取表的指定上下文
     * @param contextId 上下文ID，默认 'default'（返回 DataTable 本身）
     */
    getContext(tableName: string, contextId?: string): BindingContext | undefined;
    /**
     * 智能请求表数据（自动处理依赖）- 完全解耦：不阻塞，异步加载后通知订阅者
     * @param tableName 表名
     */
    requestTableData(tableName: string): void;
    /**
     * 内部异步请求方法
     */
    private _requestTableDataAsync;
    /**
     * 加载表数据（调用外部数据加载器）
     */
    private loadTableData;
    /**
     * 清理表的所有上下文的无效选中状态
     */
    private cleanupInvalidSelections;
    /**
     * 通知依赖已更新（触发事件，不自动加载）
     */
    private notifyDependencyUpdated;
    /**
     * 判断依赖表是否应该自动加载
     */
    private shouldAutoLoadDependentTable;
    /**
     * 通知子表：父表数据已更新
     */
    private notifyChildTables;
    /**
     * 递归清空子表及其所有后代（用于父表条件不满足时）
     */
    private recursiveClearChildTables;
    /**
     * 应用与指定表相关的所有关系
     */
    private applyRelationsForTable;
    /**
     * 更新相关联的子表
     */
    updateRelatedTables(parentTableName: string, parentContextId?: string): void;
    /**
     * 刷新所有关系
     */
    refreshAllRelations(): void;
}
//# sourceMappingURL=dataset-impl.d.ts.map