/**
 * 树管理器
 * 负责自引用树的懒加载、差量补齐和层级构建
 * 关联到 BindingContext（视图层）而非 DataTable（结构层）
 */
import type { TreeConfig, FlatTreeNode, NestedTreeNode, FlatTreeCache, TreePath } from './types';
import type { BindingContext } from './bindingContext';
/**
 * 树管理器类
 * 管理 BindingContext 中的树形数据视图
 */
export declare class TreeManager {
    private config;
    private cache;
    private eventListeners;
    private bindingContext?;
    constructor(config: TreeConfig, initialNodes?: FlatTreeNode[], bindingContext?: BindingContext);
    /**
     * 设置关联的 BindingContext
     */
    setBindingContext(bindingContext: BindingContext): void;
    /**
     * 获取关联的 BindingContext
     */
    getBindingContext(): BindingContext | undefined;
    /**
     * 获取树配置
     */
    getConfig(): TreeConfig;
    /**
     * 获取缓存
     */
    getCache(): FlatTreeCache;
    /**
     * 添加节点到缓存
     */
    addNodesToCache(nodes: FlatTreeNode[]): void;
    /**
     * 获取节点
     */
    getNode(id: string | number): FlatTreeNode | undefined;
    /**
     * 获取子节点
     */
    getChildren(parentId: string | number | null): FlatTreeNode[];
    /**
     * 获取根节点
     */
    getRoots(): FlatTreeNode[];
    /**
     * 展开到目标节点（差量补齐）
     * @param targetId 目标节点 ID
     * @param loadPathFn 加载路径的函数，返回路径 ID 数组
     * @param loadSubTreeFn 加载子树的函数，返回缺失区间的节点
     */
    expandToNode(targetId: string | number, loadPathFn: (targetId: string | number) => Promise<TreePath>, loadSubTreeFn: (fromId: string | number | null, toId: string | number) => Promise<FlatTreeNode[]>): Promise<void>;
    /**
     * 搜索节点
     * @param keyword 搜索关键词
     * @param matchFn 匹配函数，返回是否匹配
     */
    searchNodes(keyword: string, matchFn?: (node: FlatTreeNode, keyword: string) => boolean): FlatTreeNode[];
    /**
     * 获取节点路径
     */
    getNodePath(nodeId: string | number): TreePath;
    /**
     * 全量构建嵌套树
     */
    buildNestedTree(rootId?: string | number | null): NestedTreeNode[];
    /**
     * 局部构建子树（递归）
     */
    buildSubTree(rootId: string | number): NestedTreeNode | null;
    /**
     * 计算节点层级
     */
    calculateLevel(nodeId: string | number): number;
    /**
     * 标记节点是否有子节点
     */
    markHasChildren(nodeId: string | number): void;
    /**
     * 批量标记所有节点的 hasChildren 和 level
     */
    enrichNodes(): void;
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
    private emit;
    /**
     * 清空缓存
     */
    clear(): void;
    /**
     * 导出为 JSON
     */
    toJSON(): string;
    /**
     * 从 JSON 加载
     */
    static fromJSON(json: string, bindingContext?: BindingContext): TreeManager;
}
//# sourceMappingURL=treeManager.d.ts.map