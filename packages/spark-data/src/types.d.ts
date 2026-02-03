/**
 * PageData 完整解决方案 - TypeScript 类型定义
 * 参考：https://ligh60.blog.csdn.net/article/details/150585411
 */
/**
 * 数据行：键值对结构
 */
export type DataRow<T = unknown> = Record<string, T>;
/**
 * 数据绑定上下文接口（纯数据结构，可序列化）
 *
 * 作用域：单个数据表（DataTable）的某个绑定实例
 * 生命周期：与宿主表格/列表组件一致
 *
 * 用途：
 * - 管理表格/列表组件的数据状态（当前行、选中行、可见行）
 * - 支持过滤、排序、分页等数据操作
 * - 实现数据与 UI 的双向绑定
 *
 * 架构说明：
 * - 一个 DataTable 可以有多个 BindingContext（不同的 contextId）
 * - 通过 contextId 区分不同的绑定实例（如主表 vs 详情表）
 * - 支持主从表级联（主表 currentRow 变化 → 从表过滤）
 *
 * 注意：
 * - 这是接口定义，实现类是 BindingContext
 * - 所有属性可选，支持增量更新
 * - _开头的字段是内部状态，不应直接修改
 *
 * 典型使用场景：
 * - el-table 的 dataKey 绑定
 * - 主从表联动（通过 filterExpression）
 * - 表格行选中状态管理
 */
export interface IBindingContext {
    currentRow?: DataRow | null;
    selectedRows?: DataRow[];
    rows?: DataRow[];
    _originalRows?: DataRow[];
    _hostTable?: string;
    _contextId?: string;
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
}
/**
 * 列定义：描述表中每个字段的元数据
 */
export interface DataColumn {
    name: string;
    type: string;
    label?: string;
    allowDBNull?: boolean;
    defaultValue?: unknown;
    isPrimaryKey?: boolean;
    autoIncrement?: boolean;
}
/**
 * HTTP 端点定义：描述单个 API 调用的属性
 */
export interface HttpEndpoint {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    queryParams?: Record<string, unknown>;
    pathParams?: string[];
    bodySchema?: unknown;
}
/**
 * CRUD API 组：一组增删改查及导入导出接口
 */
export interface CrudApi {
    create?: HttpEndpoint;
    retrieve?: HttpEndpoint;
    update?: HttpEndpoint;
    delete?: HttpEndpoint;
    list?: HttpEndpoint & {
        pagination?: {
            pageParam?: string;
            sizeParam?: string;
            sortParam?: string;
        };
    };
    batch?: {
        create?: HttpEndpoint;
        update?: HttpEndpoint;
        delete?: HttpEndpoint;
    };
    import?: HttpEndpoint;
    export?: HttpEndpoint;
}
/**
 * TreeManager 接口（树形数据管理器）
 */
export interface ITreeManager {
    setBindingContext(context: unknown): void;
    getBindingContext(): unknown;
    getConfig(): TreeConfig;
    getCache(): FlatTreeCache;
    addNodesToCache(nodes: FlatTreeNode[]): void;
    getNode(id: string | number): FlatTreeNode | undefined;
    getChildren(parentId: string | number | null): FlatTreeNode[];
    getRoots(): FlatTreeNode[];
    buildNestedTree(rootId?: string | number | null): NestedTreeNode[];
    enrichNodes(): void;
    on(event: string, callback: Function): void;
    off(event: string, callback: Function): void;
}
/**
 * DataTable 接口（纯数据结构，用于序列化）
 */
export interface IDataTable extends IBindingContext {
    tableName: string;
    columns: DataColumn[];
    api?: CrudApi;
    rows: DataRow[];
    contexts?: Record<string, IBindingContext>;
    loading?: boolean;
    error?: string;
}
/**
 * 依赖类型：当前行 / 选中行 / 全部行 / 可自定义扩展
 */
export type DependencyType = 'currentRow' | 'selectedRows' | 'allRows' | 'pagedRows' | string;
/**
 * 排序方向
 */
export type SortDirection = 'asc' | 'desc' | 'ASC' | 'DESC';
/**
 * 排序表达式：单个字段或多个字段组合排序
 */
export type SortExpression = {
    field: string;
    direction: SortDirection;
} | {
    fields: Array<{
        field: string;
        direction: SortDirection;
    }>;
};
/**
 * 过滤操作符
 */
export type FilterOperator = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'not in' | 'like' | 'not like' | 'is null' | 'is not null' | 'between' | 'not between' | 'startsWith' | 'endsWith' | 'contains';
/**
 * 通用 JSON 过滤表达式节点定义
 */
export type FilterExpression = {
    field: string;
    op: FilterOperator;
    value: unknown;
} | {
    type: 'and' | 'or';
    children: FilterExpression[];
} | {
    type: '!condition';
    field: string;
    op: FilterOperator;
    value: unknown;
} | {
    type: '!and' | '!or';
    children: FilterExpression[];
} | {
    func: string;
    args: unknown[];
};
/**
 * DataRelation：父子表关系配置
 */
export interface DataRelation {
    parentTable: string;
    parentContextId?: string;
    childTable: string;
    childContextId?: string;
    dependencyType: DependencyType;
    filterExpression: FilterExpression;
    cascadeUpdate?: boolean;
    cascadeDelete?: boolean;
    autoLoad?: boolean;
    relationName?: string;
}
/**
 * DataSet 接口 (ISP: 接口隔离原则 - 分离数据访问和事件订阅)
 */
export interface IDataSet {
    dataSetName: string;
    tables: Record<string, IDataTable>;
    relations?: DataRelation[];
    version?: number;
    pageId?: string;
    autoLoadRelations?: boolean;
    updateRelatedTables(tableName: string): void;
    notifySubscribers(tableName: string, contextId?: string): void;
    emit(event: string, data: unknown): void;
    subscribe(tableName: string, contextId: string, callback: () => void): void;
    on(event: string, handler: Function): void;
    off(event: string, handler: Function): void;
}
/**
 * 过滤结果
 */
export interface FilterResult {
    rows: DataRow[];
    count: number;
}
/**
 * 过滤上下文接口（用于主从表关联过滤）
 *
 * 作用域：单次主从表过滤操作的临时上下文
 * 生命周期：过滤表达式解析时创建，过滤完成后销毁
 *
 * 用途：
 * - 为从表过滤提供主表的当前行/选中行数据
 * - 支持主从表级联过滤（如订单明细 ↔ 订单主表）
 * - 提供全局变量访问（variables）
 *
 * 典型使用场景：
 * - filterExpression: "parentRow.id" → 主表单行关联
 * - filterExpression: "IN(parentRows, 'id')" → 主表多行关联
 * - 通过 variables 传递额外的过滤参数
 */
export interface FilterContext {
    parentRow?: DataRow;
    parentRows?: DataRow[];
    variables?: Record<string, unknown>;
}
/**
 * 树配置
 */
export interface TreeConfig {
    mode: 'flat' | 'nested';
    tableName?: string;
    idField?: string;
    parentIdField?: string;
    textField?: string;
    depthLimit?: number;
    lazy?: boolean;
}
/**
 * 扁平树节点
 */
export interface FlatTreeNode {
    id: string | number;
    parentId?: string | number | null;
    name: string;
    level?: number;
    hasChildren?: boolean;
    isLoaded?: boolean;
    [key: string]: unknown;
}
/**
 * 嵌套树节点
 */
export interface NestedTreeNode extends FlatTreeNode {
    children: NestedTreeNode[];
}
/**
 * 扁平树缓存（用于懒加载）
 */
export type FlatTreeCache = Record<string | number, FlatTreeNode>;
/**
 * 自引用表（扩展 IDataTable）
 */
export interface SelfReferenceTable extends IDataTable {
    treeConfig: TreeConfig;
    flatTreeCache?: FlatTreeCache;
    loadChildren?(parentId: string | number | null): Promise<FlatTreeNode[]>;
    expandToNode?(targetId: string | number): Promise<void>;
    searchNodes?(keyword: string): Promise<FlatTreeNode[]>;
}
/**
 * 树路径信息
 */
export interface TreePath {
    pathIds: Array<string | number>;
    pathNodes?: FlatTreeNode[];
}
/**
 * 树搜索结果
 */
export interface TreeSearchResult {
    matchedNodes: FlatTreeNode[];
    paths: Record<string | number, TreePath>;
}
//# sourceMappingURL=types.d.ts.map