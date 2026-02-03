/**
 * BindingContext 类 - 上下文绑定
 * 负责：选中状态管理、数据视图、通知机制
 * 相当于 .NET 的 DataView - 视图层
 */
import type { DataRow, IBindingContext, FilterExpression, SortExpression, ITreeManager } from './types';
/**
 * DataSet 接口（前向声明，避免循环依赖）
 */
interface IDataSet {
    updateRelatedTables(tableName: string, contextId: string): void;
    notifySubscribers(tableName: string, contextId: string): void;
    emit(event: string, data: unknown): void;
}
/**
 * 绑定上下文类（实现 IBindingContext 接口 + 方法逻辑）
 */
export declare class BindingContext implements IBindingContext {
    currentRow: DataRow | null;
    selectedRows: DataRow[];
    rows: DataRow[];
    _originalRows?: DataRow[];
    _hostTable: string;
    _contextId: string;
    filterExpression?: FilterExpression;
    sortExpression?: SortExpression;
    autoSelectFirst?: boolean;
    autoDeselectOnEmpty?: boolean;
    pagination?: {
        pageIndex?: number;
        pageSize?: number;
        total?: number;
        totalPages?: number;
    };
    protected dataSet?: IDataSet;
    treeManager?: ITreeManager;
    constructor(hostTable: string, contextId?: string, dataSet?: IDataSet);
    /**
     * 设置 DataSet 引用
     */
    setDataSet(dataSet: IDataSet): void;
    /**
     * 设置 TreeManager 引用
     */
    setTreeManager(treeManager: ITreeManager): void;
    /**
     * 获取 TreeManager 引用
     */
    getTreeManager(): ITreeManager | undefined;
    /**
     * 设置当前选中行
     */
    setCurrentRow(row: DataRow | null, skipNotify?: boolean): void;
    /**
     * 设置选中行集合
     * @param rows 选中的行数据
     * @param skipNotify 是否跳过通知当前表的 UI 更新（但仍会触发关联更新）
     */
    setSelectedRows(rows: DataRow[], skipNotify?: boolean): void;
    /**
     * 手动触发通知
     */
    notifyChange(): void;
    /**
     * 清空所有状态（用于条件不满足时递归清空）
     */
    clearAll(skipNotify?: boolean): void;
    /**
     * 应用排序表达式
     */
    private applySorting;
    /**
     * 单字段排序
     */
    private sortByField;
    /**
     * 多字段排序
     */
    private sortByFields;
    /**
     * 更新上下文的 rows（应用过滤和排序）
     * @param sourceData 完整数据源（通常是 table._originalRows 或 table.rows）
     */
    updateRows(sourceData: DataRow[]): void;
    /**
     * 刷新上下文（重新应用过滤和排序）
     * @param sourceData 完整数据源
     */
    refresh(sourceData: DataRow[]): void;
    /**
     * 清理无效的选中状态
     * 检查 currentRow 和 selectedRows 是否还在当前上下文的 rows 中
     * @returns 是否发生了清理操作
     */
    cleanupInvalidSelections(): boolean;
    /**
     * 转换为普通对象（用于序列化）
     */
    toJSON(): {
        currentRow: DataRow | null;
        selectedRows: DataRow[];
        rows: DataRow[];
        _originalRows: DataRow[] | undefined;
        _hostTable: string;
        _contextId: string;
        filterExpression: FilterExpression | undefined;
        sortExpression: SortExpression | undefined;
        pagination: {
            pageIndex?: number | undefined;
            pageSize?: number | undefined;
            total?: number | undefined;
            totalPages?: number | undefined;
        } | undefined;
    };
    /**
     * 从普通对象创建实例
     */
    static fromJSON(data: Partial<IBindingContext>, hostTable: string, contextId: string, dataSet?: IDataSet): BindingContext;
}
export {};
//# sourceMappingURL=bindingContext.d.ts.map