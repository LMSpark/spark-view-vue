/**
 * 树管理器
 * 负责自引用树的懒加载、差量补齐和层级构建
 * 关联到 BindingContext（视图层）而非 DataTable（结构层）
 */
/**
 * 树管理器类
 * 管理 BindingContext 中的树形数据视图
 */
export class TreeManager {
    constructor(config, initialNodes, bindingContext) {
        this.cache = {};
        this.eventListeners = new Map();
        this.config = {
            idField: 'id',
            parentIdField: 'parentId',
            textField: 'name',
            lazy: true,
            ...config
        };
        this.bindingContext = bindingContext;
        if (initialNodes) {
            this.addNodesToCache(initialNodes);
        }
    }
    /**
     * 设置关联的 BindingContext
     */
    setBindingContext(bindingContext) {
        this.bindingContext = bindingContext;
    }
    /**
     * 获取关联的 BindingContext
     */
    getBindingContext() {
        return this.bindingContext;
    }
    /**
     * 获取树配置
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * 获取缓存
     */
    getCache() {
        return { ...this.cache };
    }
    /**
     * 添加节点到缓存
     */
    addNodesToCache(nodes) {
        nodes.forEach(node => {
            this.cache[node.id] = node;
        });
        this.emit('cacheUpdated', { cache: this.cache });
    }
    /**
     * 获取节点
     */
    getNode(id) {
        return this.cache[id];
    }
    /**
     * 获取子节点
     */
    getChildren(parentId) {
        return Object.values(this.cache).filter(node => node.parentId === parentId);
    }
    /**
     * 获取根节点
     */
    getRoots() {
        return this.getChildren(null);
    }
    /**
     * 展开到目标节点（差量补齐）
     * @param targetId 目标节点 ID
     * @param loadPathFn 加载路径的函数，返回路径 ID 数组
     * @param loadSubTreeFn 加载子树的函数，返回缺失区间的节点
     */
    async expandToNode(targetId, loadPathFn, loadSubTreeFn) {
        // 1. 获取目标节点的祖先链 ID
        const path = await loadPathFn(targetId);
        const { pathIds } = path;
        // 2. 对比缓存，找出缺失的节点
        const missing = pathIds.filter(id => !this.cache[id]);
        if (missing.length === 0) {
            console.info(`路径已完整缓存，无需补齐`);
            return;
        }
        // 3. 找到第一个缺失节点的父节点
        const firstMissingIndex = pathIds.indexOf(missing[0]);
        const fromId = firstMissingIndex > 0 ? pathIds[firstMissingIndex - 1] : null;
        // 4. 一次性拉取缺失区间
        console.info(`差量补齐: 从 ${fromId} 到 ${targetId}`);
        const nodes = await loadSubTreeFn(fromId, targetId);
        // 5. 更新缓存
        this.addNodesToCache(nodes);
        this.emit('pathExpanded', { targetId, path, missing });
    }
    /**
     * 搜索节点
     * @param keyword 搜索关键词
     * @param matchFn 匹配函数，返回是否匹配
     */
    searchNodes(keyword, matchFn) {
        const defaultMatchFn = (node, kw) => {
            const textField = this.config.textField ?? 'name';
            const text = node[textField];
            return typeof text === 'string' && text.toLowerCase().includes(kw.toLowerCase());
        };
        const matcher = matchFn ?? defaultMatchFn;
        return Object.values(this.cache).filter(node => matcher(node, keyword));
    }
    /**
     * 获取节点路径
     */
    getNodePath(nodeId) {
        const pathIds = [];
        const pathNodes = [];
        let currentId = nodeId;
        while (currentId !== null && currentId !== undefined) {
            const node = this.cache[currentId];
            if (!node)
                break;
            pathIds.unshift(currentId);
            pathNodes.unshift(node);
            currentId = node.parentId;
        }
        return { pathIds, pathNodes };
    }
    /**
     * 全量构建嵌套树
     */
    buildNestedTree(rootId) {
        const roots = [];
        // 获取根节点
        const rootNodes = rootId !== undefined && rootId !== null
            ? (this.cache[rootId] ? [this.cache[rootId]] : [])
            : this.getRoots();
        rootNodes.forEach(rootNode => {
            const nestedRoot = this.buildSubTree(rootNode.id);
            if (nestedRoot) {
                roots.push(nestedRoot);
            }
        });
        return roots;
    }
    /**
     * 局部构建子树（递归）
     */
    buildSubTree(rootId) {
        const node = this.cache[rootId];
        if (!node)
            return null;
        const nestedNode = { ...node, children: [] };
        // 递归构建子节点
        const children = this.getChildren(rootId);
        children.forEach(child => {
            const childTree = this.buildSubTree(child.id);
            if (childTree) {
                nestedNode.children.push(childTree);
            }
        });
        return nestedNode;
    }
    /**
     * 计算节点层级
     */
    calculateLevel(nodeId) {
        const path = this.getNodePath(nodeId);
        return path.pathIds.length - 1;
    }
    /**
     * 标记节点是否有子节点
     */
    markHasChildren(nodeId) {
        const node = this.cache[nodeId];
        if (!node)
            return;
        const children = this.getChildren(nodeId);
        node.hasChildren = children.length > 0;
    }
    /**
     * 批量标记所有节点的 hasChildren 和 level
     */
    enrichNodes() {
        Object.keys(this.cache).forEach(id => {
            const node = this.cache[id];
            node.level = this.calculateLevel(node.id);
            this.markHasChildren(node.id);
        });
    }
    /**
     * 事件监听
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.push(callback);
        }
    }
    /**
     * 移除事件监听
     */
    off(event, callback) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }
    /**
     * 触发事件
     */
    emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => callback(data));
        }
    }
    /**
     * 清空缓存
     */
    clear() {
        this.cache = {};
        this.emit('cacheCleared', {});
    }
    /**
     * 导出为 JSON
     */
    toJSON() {
        return JSON.stringify({
            config: this.config,
            cache: this.cache
        }, null, 2);
    }
    /**
     * 从 JSON 加载
     */
    static fromJSON(json, bindingContext) {
        const data = JSON.parse(json);
        const manager = new TreeManager(data.config, undefined, bindingContext);
        manager.cache = data.cache;
        return manager;
    }
}
