package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.entity.NavigationConfigEntity;
import com.spark.ai.repository.NavigationConfigRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 导航配置持久化服务 — H2 数据库版。
 * 将导航树以 JSON 字符串存储在 navigation_config 表中。
 *
 * <p>支持两种保存模式：
 * <ul>
 *   <li>整树覆盖：{@link #saveNavConfig(Map)}</li>
 *   <li>节点级 CRUD：{@link #addNode}、{@link #updateNode}、
 *       {@link #deleteNode}、{@link #moveNode}</li>
 * </ul>
 */
@Service
public class NavigationService {

    private static final Logger log = LoggerFactory.getLogger(NavigationService.class);
    private static final String DEFAULT_KEY = "default";

    private final NavigationConfigRepository navRepo;
    private final ObjectMapper objectMapper;

    public NavigationService(NavigationConfigRepository navRepo,
                              ObjectMapper objectMapper) {
        this.navRepo = navRepo;
        this.objectMapper = objectMapper;
        log.info("[Navigation] 使用 H2 嵌入式数据库存储");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 整树读写
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 读取导航配置（完整树）。
     * 若不存在返回 null。
     */
    public Map<String, Object> getNavConfig() throws IOException {
        return navRepo.findById(DEFAULT_KEY)
                .map(entity -> {
                    try {
                        return objectMapper.readValue(entity.getConfigJson(),
                                new TypeReference<Map<String, Object>>() {});
                    } catch (IOException e) {
                        log.error("[Navigation] JSON 解析失败", e);
                        return null;
                    }
                })
                .orElse(null);
    }

    /**
     * 保存导航配置（完整覆盖）。
     */
    @Transactional
    public void saveNavConfig(Map<String, Object> navRoot) throws IOException {
        String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(navRoot);
        persistJson(json);
        log.info("[Navigation] 整树保存 ({} bytes)", json.length());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 节点级 CRUD
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 新增节点。
     *
     * @param parentId 父节点 id；为 null 则追加到根 children
     * @param node     要插入的节点对象（必须含 id、title）
     * @param index    插入位置（-1 表示追加到末尾）
     * @throws IllegalArgumentException 若 id 已存在或父节点不存在
     */
    @Transactional
    public Map<String, Object> addNode(String parentId,
                                        Map<String, Object> node,
                                        int index) throws IOException {
        Map<String, Object> root = loadOrInit();
        List<Map<String, Object>> rootChildren = getChildren(root);

        // 校验：id 不能重复
        String newId = String.valueOf(node.getOrDefault("id", ""));
        if (newId.isBlank()) throw new IllegalArgumentException("节点 id 不能为空");
        if (findById(rootChildren, newId) != null) {
            throw new IllegalArgumentException("节点 id 已存在: " + newId);
        }

        List<Map<String, Object>> targetList;
        if (parentId == null || parentId.isBlank()) {
            targetList = rootChildren;
        } else {
            Map<String, Object> parent = findById(rootChildren, parentId);
            if (parent == null) throw new IllegalArgumentException("父节点不存在: " + parentId);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> pc = (List<Map<String, Object>>) parent.get("children");
            if (pc == null) {
                pc = new ArrayList<>();
                parent.put("children", pc);
            }
            targetList = pc;
        }

        if (index < 0 || index >= targetList.size()) {
            targetList.add(node);
        } else {
            targetList.add(index, node);
        }

        persistTree(root);
        log.info("[Navigation] 新增节点 id={} parentId={}", newId, parentId);
        return node;
    }

    /**
     * 更新节点属性（局部合并 patch，不覆盖 children）。
     *
     * @param id    目标节点 id
     * @param patch 要更新的字段键值对
     * @throws IllegalArgumentException 若节点不存在
     */
    @Transactional
    public Map<String, Object> updateNode(String id,
                                           Map<String, Object> patch) throws IOException {
        Map<String, Object> root = loadOrInit();
        Map<String, Object> node = findById(getChildren(root), id);
        if (node == null) throw new IllegalArgumentException("节点不存在: " + id);

        // 合并 patch（保留 children，不允许通过此接口覆盖子树）
        for (Map.Entry<String, Object> entry : patch.entrySet()) {
            if (!"children".equals(entry.getKey())) {
                node.put(entry.getKey(), entry.getValue());
            }
        }

        persistTree(root);
        log.info("[Navigation] 更新节点 id={}", id);
        return node;
    }

    /**
     * 删除节点（同时删除其所有子孙节点）。
     *
     * @param id 目标节点 id
     * @return 被删除的节点
     * @throws IllegalArgumentException 若节点不存在
     */
    @Transactional
    public Map<String, Object> deleteNode(String id) throws IOException {
        Map<String, Object> root = loadOrInit();
        List<Map<String, Object>> rootChildren = getChildren(root);
        Map<String, Object>[] result = new Map[]{null};

        boolean removed = removeById(rootChildren, id, result);
        if (!removed) throw new IllegalArgumentException("节点不存在: " + id);

        persistTree(root);
        log.info("[Navigation] 删除节点 id={}", id);
        return result[0];
    }

    /**
     * 移动节点到新父节点下的指定位置。
     *
     * @param id          要移动的节点 id
     * @param newParentId 新父节点 id（null 表示移动到根）
     * @param index       目标位置（-1 表示追加到末尾）
     * @throws IllegalArgumentException 若节点不存在或形成循环
     */
    @Transactional
    public Map<String, Object> moveNode(String id,
                                         String newParentId,
                                         int index) throws IOException {
        Map<String, Object> root = loadOrInit();
        List<Map<String, Object>> rootChildren = getChildren(root);

        // 防止移动到自身的子孙节点下
        if (newParentId != null && !newParentId.isBlank()) {
            Map<String, Object> moving = findById(rootChildren, id);
            if (moving == null) throw new IllegalArgumentException("节点不存在: " + id);
            if (isDescendant(moving, newParentId)) {
                throw new IllegalArgumentException("不能将节点移动到其自身的子孙节点下");
            }
        }

        // 先摘除
        Map<String, Object>[] result = new Map[]{null};
        if (!removeById(rootChildren, id, result)) {
            throw new IllegalArgumentException("节点不存在: " + id);
        }
        Map<String, Object> node = result[0];

        // 再插入
        List<Map<String, Object>> targetList;
        if (newParentId == null || newParentId.isBlank()) {
            targetList = getChildren(root);
        } else {
            Map<String, Object> parent = findById(getChildren(root), newParentId);
            if (parent == null) throw new IllegalArgumentException("目标父节点不存在: " + newParentId);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> pc = (List<Map<String, Object>>) parent.get("children");
            if (pc == null) {
                pc = new ArrayList<>();
                parent.put("children", pc);
            }
            targetList = pc;
        }

        if (index < 0 || index >= targetList.size()) {
            targetList.add(node);
        } else {
            targetList.add(index, node);
        }

        persistTree(root);
        log.info("[Navigation] 移动节点 id={} newParentId={} index={}", id, newParentId, index);
        return node;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 扁平化列表（管理/搜索用）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 获取导航节点列表（扁平化）。
     */
    public List<Map<String, Object>> listNodes() throws IOException {
        Map<String, Object> config = getNavConfig();
        if (config == null) return List.of();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> children = (List<Map<String, Object>>) config.get("children");
        return children == null ? List.of() : flattenNodes(children, null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 私有工具方法
    // ─────────────────────────────────────────────────────────────────────────

    /** 加载现有配置或初始化空树。 */
    private Map<String, Object> loadOrInit() throws IOException {
        Map<String, Object> root = getNavConfig();
        if (root == null) {
            root = new LinkedHashMap<>();
            root.put("childPlacement", "header");
            root.put("children", new ArrayList<>());
        }
        return root;
    }

    /** 获取或创建 root.children 列表。 */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> getChildren(Map<String, Object> root) {
        Object children = root.get("children");
        if (children instanceof List) {
            return (List<Map<String, Object>>) children;
        }
        List<Map<String, Object>> list = new ArrayList<>();
        root.put("children", list);
        return list;
    }

    /** 递归查找 id 对应的节点，找不到返回 null。 */
    @SuppressWarnings("unchecked")
    private Map<String, Object> findById(List<Map<String, Object>> nodes, String id) {
        for (Map<String, Object> node : nodes) {
            if (id.equals(node.get("id"))) return node;
            List<Map<String, Object>> children = (List<Map<String, Object>>) node.get("children");
            if (children != null) {
                Map<String, Object> found = findById(children, id);
                if (found != null) return found;
            }
        }
        return null;
    }

    /**
     * 递归删除指定 id 的节点，result[0] 存放被删节点。
     * 返回是否删除成功。
     */
    @SuppressWarnings("unchecked")
    private boolean removeById(List<Map<String, Object>> nodes,
                                String id,
                                Map<String, Object>[] result) {
        for (int i = 0; i < nodes.size(); i++) {
            Map<String, Object> node = nodes.get(i);
            if (id.equals(node.get("id"))) {
                result[0] = nodes.remove(i);
                return true;
            }
            List<Map<String, Object>> children = (List<Map<String, Object>>) node.get("children");
            if (children != null && removeById(children, id, result)) return true;
        }
        return false;
    }

    /** 判断 node 的子孙中是否包含 targetId（防止循环移动）。 */
    @SuppressWarnings("unchecked")
    private boolean isDescendant(Map<String, Object> node, String targetId) {
        List<Map<String, Object>> children = (List<Map<String, Object>>) node.get("children");
        if (children == null) return false;
        for (Map<String, Object> child : children) {
            if (targetId.equals(child.get("id"))) return true;
            if (isDescendant(child, targetId)) return true;
        }
        return false;
    }

    /** 递归扁平化，附加 parentId 字段方便前端使用。 */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> flattenNodes(List<Map<String, Object>> nodes,
                                                    String parentId) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> node : nodes) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", node.getOrDefault("id", ""));
            item.put("title", node.getOrDefault("title", ""));
            item.put("icon", node.getOrDefault("icon", ""));
            item.put("path", node.getOrDefault("path", ""));
            item.put("type", node.getOrDefault("type", ""));
            item.put("parentId", parentId != null ? parentId : "");
            item.put("hasChildren", node.containsKey("children"));
            result.add(item);

            List<Map<String, Object>> children = (List<Map<String, Object>>) node.get("children");
            if (children != null) {
                result.addAll(flattenNodes(children, String.valueOf(node.get("id"))));
            }
        }
        return result;
    }

    /** 持久化整树到 DB。 */
    private void persistTree(Map<String, Object> root) throws IOException {
        persistJson(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(root));
    }

    private void persistJson(String json) {
        NavigationConfigEntity entity = navRepo.findById(DEFAULT_KEY)
                .orElseGet(() -> {
                    NavigationConfigEntity e = new NavigationConfigEntity();
                    e.setConfigKey(DEFAULT_KEY);
                    return e;
                });
        entity.setConfigJson(json);
        navRepo.save(entity);
    }
}
