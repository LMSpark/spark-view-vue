package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Instant;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 项目导航树持久化服务（NAVIGATION_NODE_FLAT）— 按 (tenantId, projectId) 隔离。
 */
@Service
public class ProjectNavigationTreeService {

    private record FlatNode(String nodeId, String parentId, Integer sortOrder, Map<String, Object> node) {}

    private static final Logger log = LoggerFactory.getLogger(ProjectNavigationTreeService.class);
    private static final String DEFAULT_HOME_PATH = "/dashboard";
    private static final Pattern FRAME_ANCESTORS_PATTERN = Pattern.compile("frame-ancestors\\s+([^;]+)", Pattern.CASE_INSENSITIVE);
    private static final Set<String> VALID_NODE_KINDS = Set.of("system-directory", "module", "system-page", "system-action", "page", "link", "sub-page", "ref");
    private static final Set<String> VALID_CHILD_PLACEMENTS = Set.of("header", "sidebar", "toolbar", "user-menu", "parent", "flat");

    // ── SQL（PARENT_ID 为 VARCHAR，存 NODE_ID 字符串）─────────────────────

    private static final String SELECT_FLAT_SQL = """
        SELECT NODE_ID, PARENT_ID, TITLE, DESCRIPTION, NODE_KIND, PATH, ICON,
           DIVIDER_AFTER, CHILD_PLACEMENT, LINK_TARGET,
           HIDDEN, DISABLED, SORT_ORDER, REF_ID, CONTEXT,
           PERMISSIONS
        FROM NAVIGATION_NODE_FLAT
        WHERE TENANT_ID = ? AND PROJECT_ID = ?
        ORDER BY SORT_ORDER, NODE_ID
        """;
    private static final String DELETE_ALL_SQL = """
        DELETE FROM NAVIGATION_NODE_FLAT
        WHERE TENANT_ID = ? AND PROJECT_ID = ?
        """;
    private static final String INSERT_FLAT_SQL = """
        INSERT INTO NAVIGATION_NODE_FLAT (
            PARENT_ID, TENANT_ID, PROJECT_ID,
            TITLE, DESCRIPTION, NODE_KIND, PATH, ICON,
            DIVIDER_AFTER, CHILD_PLACEMENT, LINK_TARGET,
            HIDDEN, DISABLED, SORT_ORDER,
            NODE_ID, UPDATED_AT, REF_ID, CONTEXT,
            PERMISSIONS
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """;
    private static final String EXISTS_NODE_SQL = """
        SELECT 1 FROM NAVIGATION_NODE_FLAT
        WHERE TENANT_ID = ? AND PROJECT_ID = ? AND NODE_ID = ?
        """;
    private static final String MAX_SORT_ORDER_SQL = """
        SELECT COALESCE(MAX(SORT_ORDER), -1) + 1
        FROM NAVIGATION_NODE_FLAT
        WHERE TENANT_ID = ? AND PROJECT_ID = ? AND PARENT_ID %s
        """;
    private static final String SHIFT_SORT_ORDER_SQL = """
        UPDATE NAVIGATION_NODE_FLAT SET SORT_ORDER = SORT_ORDER + 1
        WHERE TENANT_ID = ? AND PROJECT_ID = ? AND PARENT_ID %s AND SORT_ORDER >= ?
        """;
    private static final String UPDATE_NODE_SQL = """
        UPDATE NAVIGATION_NODE_FLAT SET
            TITLE = ?, DESCRIPTION = ?, NODE_KIND = ?, PATH = ?, ICON = ?,
            DIVIDER_AFTER = ?, CHILD_PLACEMENT = ?, LINK_TARGET = ?,
            HIDDEN = ?, DISABLED = ?, REF_ID = ?, CONTEXT = ?,
            PERMISSIONS = ?, UPDATED_AT = ?
        WHERE TENANT_ID = ? AND PROJECT_ID = ? AND NODE_ID = ?
        """;
    private static final String DELETE_BY_NODE_ID_SQL = """
        DELETE FROM NAVIGATION_NODE_FLAT
        WHERE TENANT_ID = ? AND PROJECT_ID = ? AND NODE_ID = ?
        """;
    private static final String DELETE_CHILDREN_SQL = """
        DELETE FROM NAVIGATION_NODE_FLAT
        WHERE TENANT_ID = ? AND PROJECT_ID = ? AND PARENT_ID = ?
        """;
    private static final String SELECT_CHILDREN_SQL = """
        SELECT NODE_ID FROM NAVIGATION_NODE_FLAT
        WHERE TENANT_ID = ? AND PROJECT_ID = ? AND PARENT_ID = ?
        """;
    private static final String MOVE_NODE_SQL = """
        UPDATE NAVIGATION_NODE_FLAT SET
            PARENT_ID = ?, SORT_ORDER = ?, UPDATED_AT = ?
        WHERE TENANT_ID = ? AND PROJECT_ID = ? AND NODE_ID = ?
        """;
    private static final String CHECK_SYSTEM_ROOT_SQL = """
        SELECT NODE_KIND, PARENT_ID FROM NAVIGATION_NODE_FLAT WHERE NODE_ID = ?
        """;
    /** 跨项目解析 ref 节点：通过全局唯一 NODE_ID 查目标节点基本信息 */
    private static final String RESOLVE_REF_SQL = """
        SELECT NODE_ID, TENANT_ID, PROJECT_ID, TITLE, ICON, PATH, NODE_KIND
        FROM NAVIGATION_NODE_FLAT WHERE NODE_ID = ?
        """;

    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;

    public ProjectNavigationTreeService(ObjectMapper objectMapper,
                                        JdbcTemplate jdbcTemplate) {
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    void ensureSchema() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS NAVIGATION_NODE_FLAT (
                NODE_ID         VARCHAR(255)  NOT NULL PRIMARY KEY,
                PARENT_ID       VARCHAR(255),
                TENANT_ID       VARCHAR(255)  NOT NULL,
                PROJECT_ID      VARCHAR(255)  NOT NULL,
                TITLE           VARCHAR(500),
                DESCRIPTION     VARCHAR(2000),
                NODE_KIND       VARCHAR(50),
                PATH            VARCHAR(500),
                ICON            VARCHAR(255),
                DIVIDER_AFTER   BOOLEAN       DEFAULT FALSE,
                CHILD_PLACEMENT VARCHAR(50),
                LINK_TARGET     VARCHAR(50),
                HIDDEN          BOOLEAN       DEFAULT FALSE,
                DISABLED        BOOLEAN       DEFAULT FALSE,
                SORT_ORDER      INT           DEFAULT 0,
                UPDATED_AT      TIMESTAMP,
                REF_ID          VARCHAR(255),
                CONTEXT         CLOB,
                PERMISSIONS     VARCHAR(2000)
            )
            """);
        // 向已有表安全添加新列（列已存在则忽略）
        safeAddColumn("PERMISSIONS", "VARCHAR(2000)");
        jdbcTemplate.execute("""
            CREATE INDEX IF NOT EXISTS IDX_NAV_TENANT_PROJECT
            ON NAVIGATION_NODE_FLAT (TENANT_ID, PROJECT_ID)
            """);
        log.info("[Navigation] 表 NAVIGATION_NODE_FLAT 已就绪");
    }

    /** 安全添加列：如果列已存在则忽略。 */
    private void safeAddColumn(String column, String type) {
        try {
            jdbcTemplate.execute("ALTER TABLE NAVIGATION_NODE_FLAT ADD COLUMN " + column + " " + type);
            log.info("[Navigation] 已添加列 {}", column);
        } catch (Exception e) {
            // 列已存在，忽略
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 整树读写
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 读取导航配置（完整树）。
     */
    public Map<String, Object> getNavConfig(String tenantId, String projectId) throws IOException {
        List<Map<String, Object>> rows = fetchFlatRows(tenantId, projectId);
        Map<String, Object> root = buildRootFromFlatRows(rows);
        if (root != null) {
            resolveRefNodes(root, tenantId, projectId);
        }
        return root;
    }

    /**
     * 保存导航配置（完整覆盖）。
     */
    @Transactional
    public void saveNavConfig(String tenantId, String projectId,
                               Map<String, Object> navRoot) throws IOException {
        persistTree(tenantId, projectId, navRoot);
        String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(navRoot);
        log.info("[Navigation] 整树保存 tenant={} project={} ({} bytes)", tenantId, projectId, json.length());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 节点级 CRUD
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 新增节点（增量 INSERT）。
     *
     * @param parentId 父节点 NODE_ID；为 null 则追加到根
     * @param node     要插入的节点对象（必须含 id、title）
     * @param index    插入位置（-1 表示追加到末尾）
     */
    @Transactional
    public Map<String, Object> addNode(String tenantId, String projectId,
                                        String parentId,
                                        Map<String, Object> node,
                                        int index) throws IOException {
        Map<String, Object> sanitized = sanitizeNode(node);
        String newId = asTrimmedString(sanitized.get("id"));
        if (newId.isBlank()) {
            newId = UUID.randomUUID().toString();
            sanitized.put("id", newId);
        }

        if (nodeExists(tenantId, projectId, newId)) {
            throw new IllegalArgumentException("节点 id 已存在: " + newId);
        }

        String parentNodeId = trimOrNull(parentId);
        if (parentNodeId != null && !nodeExists(tenantId, projectId, parentNodeId)) {
            throw new IllegalArgumentException("父节点不存在: " + parentNodeId);
        }

        int sortOrder;
        if (index < 0) {
            sortOrder = nextSortOrder(tenantId, projectId, parentNodeId);
        } else {
            shiftSortOrders(tenantId, projectId, parentNodeId, index);
            sortOrder = index;
        }

        insertFlatRow(tenantId, projectId, parentNodeId, sanitized, sortOrder);
        log.info("[Navigation] 新增节点 id={} tenant={} project={}", newId, tenantId, projectId);
        return sanitized;
    }

    @Transactional
    public Map<String, Object> updateNode(String tenantId, String projectId,
                                           String id,
                                           Map<String, Object> patch) throws IOException {
        if (isSystemRootDirectory(id)) {
            throw new IllegalArgumentException("系统目录不可修改目录属性，仅可编辑子项: " + id);
        }
        if (!nodeExists(tenantId, projectId, id)) {
            throw new IllegalArgumentException("节点不存在: " + id);
        }

        Map<String, Object> merged = new LinkedHashMap<>(patch);
        merged.put("id", id);
        String title = asTrimmedString(merged.get("title"));
        if (title.isBlank()) title = id;

        jdbcTemplate.update(UPDATE_NODE_SQL,
                title,
                blankToNull(asTrimmedString(merged.get("description"))),
                blankToNull(asTrimmedString(merged.get("nodeKind"))),
                blankToNull(asTrimmedString(merged.get("path"))),
                blankToNull(asTrimmedString(merged.get("icon"))),
                toBoolean(merged.get("dividerAfter")),
                blankToNull(asTrimmedString(merged.get("childPlacement"))),
                blankToNull(asTrimmedString(merged.get("linkTarget"))),
                toBoolean(merged.get("hidden")),
                toBoolean(merged.get("disabled")),
                blankToNull(asTrimmedString(merged.get("refId"))),
                serializeContext(merged.get("context")),
                blankToNull(asTrimmedString(merged.get("permissionMode"))),
                Timestamp.from(Instant.now()),
                tenantId, projectId, id);

        log.info("[Navigation] 更新节点 id={} tenant={} project={}", id, tenantId, projectId);
        return merged;
    }

    @Transactional
    public Map<String, Object> deleteNode(String tenantId, String projectId,
                                           String id) throws IOException {
        if (isSystemRootDirectory(id)) {
            throw new IllegalArgumentException("系统目录不可删除: " + id);
        }
        if (!nodeExists(tenantId, projectId, id)) {
            throw new IllegalArgumentException("节点不存在: " + id);
        }

        deleteNodeRecursive(tenantId, projectId, id);
        log.info("[Navigation] 删除节点 id={} tenant={} project={}", id, tenantId, projectId);
        return Map.of("id", id);
    }

    @Transactional
    public Map<String, Object> moveNode(String tenantId, String projectId,
                                         String id, String newParentId,
                                         int index) throws IOException {
        if (isSystemRootDirectory(id)) {
            throw new IllegalArgumentException("系统目录不可修改层级: " + id);
        }
        if (!nodeExists(tenantId, projectId, id)) {
            throw new IllegalArgumentException("节点不存在: " + id);
        }

        String parentNodeId = trimOrNull(newParentId);
        if (parentNodeId != null) {
            if (!nodeExists(tenantId, projectId, parentNodeId)) {
                throw new IllegalArgumentException("目标父节点不存在: " + parentNodeId);
            }
            if (isDescendantOf(tenantId, projectId, id, parentNodeId)) {
                throw new IllegalArgumentException("不能将节点移动到其自身的子孙节点下");
            }
        }

        int sortOrder;
        if (index < 0) {
            sortOrder = nextSortOrder(tenantId, projectId, parentNodeId);
        } else {
            shiftSortOrders(tenantId, projectId, parentNodeId, index);
            sortOrder = index;
        }

        jdbcTemplate.update(MOVE_NODE_SQL,
                parentNodeId, sortOrder, Timestamp.from(Instant.now()),
                tenantId, projectId, id);

        log.info("[Navigation] 移动节点 id={} newParentId={} tenant={} project={}",
            id, parentNodeId, tenantId, projectId);
        return Map.of("id", id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 扁平化列表
    // ─────────────────────────────────────────────────────────────────────────

    public List<Map<String, Object>> listNodes(String tenantId, String projectId) throws IOException {
        Map<String, Object> root = getNavConfig(tenantId, projectId);
        if (root == null) {
            return List.of();
        }
        return flattenNodes(readChildren(root), null);
    }

    public List<Map<String, Object>> listNestedNodes(String tenantId,
                                                     String projectId,
                                                     String rootId,
                                                     Integer limit,
                                                     Integer depthLimit) throws IOException {
        Map<String, Object> root = getNavConfig(tenantId, projectId);
        if (root == null) {
            return List.of();
        }
        List<Map<String, Object>> nodes = resolveNestedRoots(root, rootId);
        List<Map<String, Object>> limited = limitNodes(nodes, limit);
        Integer normalizedDepthLimit = normalizePositive(depthLimit);
        return cloneNodesWithDepthLimit(limited, normalizedDepthLimit, 0);
    }

    public List<Map<String, Object>> listNodeChildren(String tenantId,
                                                      String projectId,
                                                      String parentId,
                                                      Integer limit) throws IOException {
        Map<String, Object> root = getNavConfig(tenantId, projectId);
        if (root == null) {
            return List.of();
        }

        List<Map<String, Object>> children;
        String normalizedParentId = trimOrNull(parentId);
        if (normalizedParentId == null) {
            children = readChildren(root);
        } else {
            Map<String, Object> parent = findById(readChildren(root), normalizedParentId);
            if (parent == null) {
                return List.of();
            }
            children = readChildren(parent);
        }

        List<Map<String, Object>> limited = limitNodes(children, limit);
        List<Map<String, Object>> result = new ArrayList<>();
        String flatParentId = normalizedParentId == null ? "" : normalizedParentId;
        for (Map<String, Object> child : limited) {
            result.add(toFlatNode(child, flatParentId));
        }
        return result;
    }

    public Map<String, Object> getNodePath(String tenantId, String projectId, String nodeId) throws IOException {
        Map<String, Object> root = getNavConfig(tenantId, projectId);
        if (root == null) {
            return Map.of("pathIds", List.of());
        }
        List<String> pathIds = new ArrayList<>();
        boolean found = findPathIds(readChildren(root), nodeId, pathIds);
        return Map.of("pathIds", found ? pathIds : List.of());
    }

    public Map<String, Map<String, Object>> getNodeSubtree(String tenantId,
                                                           String projectId,
                                                           String fromId,
                                                           String toId,
                                                           boolean includeTargetChildren) throws IOException {
        Map<String, Object> root = getNavConfig(tenantId, projectId);
        if (root == null) {
            return Map.of();
        }

        List<Map<String, Object>> path = new ArrayList<>();
        if (!findPathNodes(readChildren(root), toId, path)) {
            return Map.of();
        }

        int startIndex = 0;
        String normalizedFromId = trimOrNull(fromId);
        if (normalizedFromId != null) {
            for (int index = 0; index < path.size(); index++) {
                if (normalizedFromId.equals(asTrimmedString(path.get(index).get("id")))) {
                    startIndex = index + 1;
                    break;
                }
            }
        }

        Map<String, Map<String, Object>> result = new LinkedHashMap<>();
        for (int index = startIndex; index < path.size(); index++) {
            Map<String, Object> node = path.get(index);
            String parentNodeId = index > 0 ? asTrimmedString(path.get(index - 1).get("id")) : "";
            result.put(asTrimmedString(node.get("id")), toFlatNode(node, parentNodeId));
        }

        if (includeTargetChildren && !path.isEmpty()) {
            Map<String, Object> target = path.get(path.size() - 1);
            appendDescendantFlatNodes(readChildren(target), asTrimmedString(target.get("id")), result);
        }

        return result;
    }

    public List<Map<String, Object>> searchNestedNodes(String tenantId,
                                                       String projectId,
                                                       String keyword,
                                                       Integer limit) throws IOException {
        Map<String, Object> root = getNavConfig(tenantId, projectId);
        if (root == null) {
            return List.of();
        }

        List<Map<String, Object>> results = new ArrayList<>();
        int normalizedLimit = limit != null && limit > 0 ? limit : Integer.MAX_VALUE;
        searchNestedNodes(readChildren(root), keyword, "", new ArrayList<>(), results, normalizedLimit);
        return results;
    }

    public List<Map<String, Object>> searchFlatNodes(String tenantId,
                                                     String projectId,
                                                     String keyword,
                                                     Integer limit) throws IOException {
        String normalizedKeyword = keyword == null ? "" : keyword.trim().toLowerCase();
        if (normalizedKeyword.isBlank()) {
            return List.of();
        }

        List<Map<String, Object>> nodes = listNodes(tenantId, projectId);
        List<Map<String, Object>> result = new ArrayList<>();
        int normalizedLimit = limit != null && limit > 0 ? limit : Integer.MAX_VALUE;
        for (Map<String, Object> node : nodes) {
            String title = asTrimmedString(node.get("title")).toLowerCase();
            String path = asTrimmedString(node.get("path")).toLowerCase();
            String nodeKind = asTrimmedString(node.get("nodeKind")).toLowerCase();
            if (title.contains(normalizedKeyword)
                    || path.contains(normalizedKeyword)
                    || nodeKind.contains(normalizedKeyword)) {
                result.add(node);
                if (result.size() >= normalizedLimit) {
                    break;
                }
            }
        }
        return result;
    }

    public List<Map<String, Object>> listRawFlatRows(String tenantId, String projectId) {
        return fetchFlatRows(tenantId, projectId);
    }

    public Map<String, Object> probeLinkEmbeddable(String rawUrl) throws IOException {
        URI uri;
        try {
            uri = URI.create(rawUrl);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("URL 格式非法");
        }

        String scheme = Optional.ofNullable(uri.getScheme()).orElse("").toLowerCase();
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            throw new IllegalArgumentException("仅支持 http/https 链接");
        }

        HttpClient client = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(Duration.ofSeconds(8))
                .build();

        HttpResponse<Void> response = requestHead(client, uri);
        if (response == null || response.statusCode() >= 400 || response.statusCode() == 405) {
            response = requestGet(client, uri);
        }
        if (response == null) {
            throw new IOException("无法获取目标站点响应头");
        }

        String xFrameOptions = response.headers().firstValue("x-frame-options").orElse("");
        String csp = response.headers().firstValue("content-security-policy").orElse("");
        String frameAncestors = extractFrameAncestors(csp);

        boolean denyByXfo = isDeniedByXfo(xFrameOptions);
        boolean denyByCsp = isDeniedByFrameAncestors(frameAncestors);
        boolean embeddable = !(denyByXfo || denyByCsp);
        String recommendedMode = embeddable ? "iframe" : "new-tab";

        String reason;
        if (denyByXfo) {
            reason = "目标站点通过 X-Frame-Options 禁止跨站 iframe";
        } else if (denyByCsp) {
            reason = "目标站点通过 CSP frame-ancestors 禁止跨站 iframe";
        } else {
            reason = "未检测到明确防嵌入响应头";
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("url", rawUrl);
        result.put("statusCode", response.statusCode());
        result.put("xFrameOptions", xFrameOptions);
        result.put("frameAncestors", frameAncestors);
        result.put("embeddable", embeddable);
        result.put("recommendedMode", recommendedMode);
        result.put("reason", reason);
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 私有工具方法
    // ─────────────────────────────────────────────────────────────────────────

    private Map<String, Object> loadOrInit(String tenantId, String projectId) throws IOException {
        Map<String, Object> root = getNavConfig(tenantId, projectId);
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

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> readChildren(Map<String, Object> node) {
        Object children = node.get("children");
        if (children instanceof List) {
            return (List<Map<String, Object>>) children;
        }
        return List.of();
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
            Map<String, Object> item = toFlatNode(node, parentId);
            result.add(item);

            List<Map<String, Object>> children = readChildren(node);
            if (children != null) {
                result.addAll(flattenNodes(children, String.valueOf(node.get("id"))));
            }
        }
        return result;
    }

    private Map<String, Object> toFlatNode(Map<String, Object> node, String parentId) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", asTrimmedString(node.get("id")));
        item.put("title", asTrimmedString(node.get("title")));
        item.put("icon", asTrimmedString(node.get("icon")));
        item.put("path", asTrimmedString(node.get("path")));
        item.put("nodeKind", asTrimmedString(node.get("nodeKind")));
        item.put("parentId", parentId != null ? parentId : "");
        item.put("hasChildren", !readChildren(node).isEmpty());

        putIfNotBlank(item, "description", asTrimmedString(node.get("description")));
        putIfNotBlank(item, "linkTarget", asTrimmedString(node.get("linkTarget")));
        putIfNotBlank(item, "childPlacement", asTrimmedString(node.get("childPlacement")));
        putIfNotBlank(item, "refId", asTrimmedString(node.get("refId")));

        if (Boolean.TRUE.equals(node.get("dividerAfter"))) {
            item.put("dividerAfter", true);
        }
        if (Boolean.TRUE.equals(node.get("hidden"))) {
            item.put("hidden", true);
        }
        if (Boolean.TRUE.equals(node.get("disabled"))) {
            item.put("disabled", true);
        }
        if (node.get("sortOrder") instanceof Number sortOrder) {
            item.put("sortOrder", sortOrder.intValue());
        }
        if (node.containsKey("context") && node.get("context") != null) {
            item.put("context", node.get("context"));
        }
        return item;
    }

    private List<Map<String, Object>> resolveNestedRoots(Map<String, Object> root, String rootId) {
        String normalizedRootId = trimOrNull(rootId);
        if (normalizedRootId == null) {
            return readChildren(root);
        }
        Map<String, Object> target = findById(readChildren(root), normalizedRootId);
        if (target == null) {
            return List.of();
        }
        return List.of(target);
    }

    private List<Map<String, Object>> limitNodes(List<Map<String, Object>> nodes, Integer limit) {
        Integer normalizedLimit = normalizePositive(limit);
        if (normalizedLimit == null || nodes.size() <= normalizedLimit) {
            return new ArrayList<>(nodes);
        }
        return new ArrayList<>(nodes.subList(0, normalizedLimit));
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> cloneNodesWithDepthLimit(List<Map<String, Object>> nodes,
                                                               Integer depthLimit,
                                                               int depth) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> node : nodes) {
            Map<String, Object> copy = new LinkedHashMap<>(node);
            List<Map<String, Object>> children = readChildren(node);
            if (!children.isEmpty()) {
                if (depthLimit != null && depth >= depthLimit) {
                    copy.remove("children");
                } else {
                    copy.put("children", cloneNodesWithDepthLimit(children, depthLimit, depth + 1));
                }
            }
            result.add(copy);
        }
        return result;
    }

    private Integer normalizePositive(Integer value) {
        if (value == null || value <= 0) {
            return null;
        }
        return value;
    }

    private boolean findPathIds(List<Map<String, Object>> nodes, String targetId, List<String> pathIds) {
        for (Map<String, Object> node : nodes) {
            String nodeId = asTrimmedString(node.get("id"));
            pathIds.add(nodeId);
            if (targetId.equals(nodeId)) {
                return true;
            }
            if (findPathIds(readChildren(node), targetId, pathIds)) {
                return true;
            }
            pathIds.remove(pathIds.size() - 1);
        }
        return false;
    }

    private boolean findPathNodes(List<Map<String, Object>> nodes, String targetId, List<Map<String, Object>> path) {
        for (Map<String, Object> node : nodes) {
            path.add(node);
            if (targetId.equals(asTrimmedString(node.get("id")))) {
                return true;
            }
            if (findPathNodes(readChildren(node), targetId, path)) {
                return true;
            }
            path.remove(path.size() - 1);
        }
        return false;
    }

    private void appendDescendantFlatNodes(List<Map<String, Object>> nodes,
                                           String parentId,
                                           Map<String, Map<String, Object>> result) {
        for (Map<String, Object> node : nodes) {
            String nodeId = asTrimmedString(node.get("id"));
            result.put(nodeId, toFlatNode(node, parentId));
            appendDescendantFlatNodes(readChildren(node), nodeId, result);
        }
    }

    private void searchNestedNodes(List<Map<String, Object>> nodes,
                                   String keyword,
                                   String parentId,
                                   List<Map<String, Object>> path,
                                   List<Map<String, Object>> results,
                                   int limit) {
        if (results.size() >= limit) {
            return;
        }
        String normalizedKeyword = keyword == null ? "" : keyword.trim().toLowerCase();
        for (Map<String, Object> node : nodes) {
            String nodeId = asTrimmedString(node.get("id"));
            Map<String, Object> flatNode = toFlatNode(node, parentId);
            path.add(flatNode);

            String title = asTrimmedString(node.get("title")).toLowerCase();
            if (!normalizedKeyword.isBlank() && title.contains(normalizedKeyword)) {
                Map<String, Object> hit = new LinkedHashMap<>();
                hit.put("node", flatNode);
                hit.put("path", new ArrayList<>(path));
                results.add(hit);
                if (results.size() >= limit) {
                    path.remove(path.size() - 1);
                    return;
                }
            }

            searchNestedNodes(readChildren(node), keyword, nodeId, path, results, limit);
            path.remove(path.size() - 1);
            if (results.size() >= limit) {
                return;
            }
        }
    }

    private void persistTree(String tenantId, String projectId,
                              Map<String, Object> root) throws IOException {
        sanitizeNavRoot(root);
        replaceFlatRows(tenantId, projectId, root);
    }

    @SuppressWarnings("unchecked")
    private void sanitizeNavRoot(Map<String, Object> root) {
        String placement = asTrimmedString(root.get("childPlacement"));
        String homePath = normalizePath(asTrimmedString(root.get("homePath")));
        if (!"header".equals(placement) && !"sidebar".equals(placement)) {
            placement = "header";
        }

        List<Map<String, Object>> children = root.get("children") instanceof List
                ? (List<Map<String, Object>>) root.get("children")
                : new ArrayList<>();

        List<Map<String, Object>> sanitizedChildren = sanitizeChildren(children);

        String id = asTrimmedString(root.get("id"));
        String title = asTrimmedString(root.get("title"));
        String description = asTrimmedString(root.get("description"));
        String version = asTrimmedString(root.get("version"));

        root.clear();
        root.put("childPlacement", placement);
        root.put("children", sanitizedChildren);

        if (!id.isBlank()) {
            root.put("id", id);
        }
        if (!title.isBlank()) {
            root.put("title", title);
        }
        if (!description.isBlank()) {
            root.put("description", description);
        }
        if (!version.isBlank()) {
            root.put("version", version);
        }
        if (!homePath.isBlank()) {
            root.put("homePath", homePath);
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> sanitizeChildren(List<Map<String, Object>> children) {
        List<Map<String, Object>> sanitized = new ArrayList<>();
        for (Map<String, Object> child : children) {
            if (child == null) continue;
            Map<String, Object> node = sanitizeNode(child);
            if (!node.isEmpty()) {
                sanitized.add(node);
            }
        }
        return sanitized;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> sanitizeNode(Map<String, Object> raw) {
        String id = asTrimmedString(raw.get("id"));
        if (id.isBlank()) {
            return Map.of();
        }

        String kind = normalizeNodeKind(raw, id);
        String title = asTrimmedString(raw.get("title"));
        if (title.isBlank()) {
            title = id;
        }

        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", id);
        node.put("nodeKind", kind);
        node.put("title", title);

        putIfNotBlank(node, "icon", asTrimmedString(raw.get("icon")));
        putIfNotBlank(node, "description", asTrimmedString(raw.get("description")));

        if (raw.get("order") instanceof Number order) {
            int orderValue = order.intValue();
            if (orderValue != 0) {
                node.put("order", orderValue);
            }
        }
        if (Boolean.TRUE.equals(raw.get("dividerAfter"))) {
            node.put("dividerAfter", true);
        }
        if (Boolean.TRUE.equals(raw.get("disabled"))) {
            node.put("disabled", true);
        }
        // 权限模式：none / masked / invisible
        String permMode = asTrimmedString(raw.get("permissionMode"));
        if ("none".equals(permMode) || "masked".equals(permMode) || "invisible".equals(permMode)) {
            node.put("permissionMode", permMode);
        } else {
            node.put("permissionMode", "masked");
        }
        if (raw.containsKey("context") && raw.get("context") != null) {
            node.put("context", raw.get("context"));
        }

        // linkTarget: 读取新字段，兼容旧 pageType 字段
        String linkTarget = asTrimmedString(raw.get("linkTarget"));
        if (linkTarget.isBlank()) {
            // 兼容: 旧数据可能仍用 pageType 存储 iframe/new-tab
            String legacyPageType = asTrimmedString(raw.get("pageType"));
            if ("iframe".equals(legacyPageType) || "new-tab".equals(legacyPageType)) {
                linkTarget = legacyPageType;
            }
        }

        String childPlacement = asTrimmedString(raw.get("childPlacement"));

        List<Map<String, Object>> children = raw.get("children") instanceof List
                ? sanitizeChildren((List<Map<String, Object>>) raw.get("children"))
                : List.of();

        switch (kind) {
            case "system-directory", "module" -> {
                if (!childPlacement.isBlank() && VALID_CHILD_PLACEMENTS.contains(childPlacement)) {
                    node.put("childPlacement", childPlacement);
                }

                putIfNotBlank(node, "redirect", normalizePath(asTrimmedString(raw.get("redirect"))));
                if (!children.isEmpty()) {
                    node.put("children", children);
                }
            }
            case "sub-page" -> {
                node.put("hidden", true);
                putIfNotBlank(node, "parentPageId", asTrimmedString(raw.get("parentPageId")));
            }
            case "ref" -> {
                // 跨工程引用：仅存储 refId，运行时由 resolveRefNodes 填充目标信息
                putIfNotBlank(node, "refId", asTrimmedString(raw.get("refId")));
                if (Boolean.TRUE.equals(raw.get("hidden"))) {
                    node.put("hidden", true);
                }
            }
            case "link" -> {
                // 新模型: path 存外部 URL，linkTarget 区分 iframe/new-tab
                // 兼容旧模型: externalUrl → 迁移到 path
                String linkPath = asTrimmedString(raw.get("path"));
                String legacyUrl = asTrimmedString(raw.get("externalUrl"));
                String effectivePath = !linkPath.isBlank() ? linkPath : legacyUrl;
                putIfNotBlank(node, "path", effectivePath);

                // linkTarget 已在上方从 raw 读取（含旧 pageType 兼容）
                // 兼容旧 linkRenderMode: 若无 linkTarget 但有旧字段，推断
                if (linkTarget.isBlank() && !effectivePath.isBlank()) {
                    String legacyMode = asTrimmedString(raw.get("linkRenderMode"));
                    linkTarget = "new-tab".equals(legacyMode) ? "new-tab" : "iframe";
                }
                if (!linkTarget.isBlank()) {
                    node.put("linkTarget", linkTarget);
                } else if (!effectivePath.isBlank()) {
                    node.put("linkTarget", "iframe");
                }

                if (Boolean.TRUE.equals(raw.get("hidden"))) {
                    node.put("hidden", true);
                }
            }
            default -> {
                if (!childPlacement.isBlank() && VALID_CHILD_PLACEMENTS.contains(childPlacement)) {
                    node.put("childPlacement", childPlacement);
                }
                if ("system-page".equals(kind)) {
                    // system-page: path 可能是 action 标识符（如 ai-design）或路由路径
                    // action 标识符不加 '/' 前缀，保持原样
                    String spPath = asTrimmedString(raw.get("path"));
                    putIfNotBlank(node, "path", spPath);
                    // 兼容旧数据：legacy action 合并到 path（action 字段已移除）
                    if (!node.containsKey("path")) {
                        putIfNotBlank(node, "path", asTrimmedString(raw.get("action")));
                    }
                } else if ("system-action".equals(kind)) {
                    // system-action: path 是动作标识符（如 'ai-design'），规范化为无 '/' 前缀
                    String actionPath = asTrimmedString(raw.get("path")).replaceAll("^/+", "");
                    putIfNotBlank(node, "path", actionPath);
                } else {
                    putIfNotBlank(node, "path", normalizePath(asTrimmedString(raw.get("path"))));
                }
                putIfNotBlank(node, "redirect", normalizePath(asTrimmedString(raw.get("redirect"))));
                if (Boolean.TRUE.equals(raw.get("hidden"))) {
                    node.put("hidden", true);
                }
                if (!children.isEmpty()) {
                    node.put("children", children);
                }
            }
        }

        return node;
    }

    private String normalizeNodeKind(Map<String, Object> raw, String id) {
        String placement = asTrimmedString(raw.get("childPlacement"));
        if ("toolbar".equals(placement) || "user-menu".equals(placement)) {
            return "system-directory";
        }

        String kind = asTrimmedString(raw.get("nodeKind"));
        if (!VALID_NODE_KINDS.contains(kind)) {
            kind = inferNodeKind(raw, id);
        }

        String externalUrl = asTrimmedString(raw.get("externalUrl"));
        String rawLinkTarget = asTrimmedString(raw.get("linkTarget"));
        String rawPageType = asTrimmedString(raw.get("pageType"));
        boolean isLinkByField = !rawLinkTarget.isBlank()
                || "iframe".equals(rawPageType) || "new-tab".equals(rawPageType);
        if ("page".equals(kind) && (!externalUrl.isBlank() || isLinkByField)) {
            kind = "link";
        }

        return kind;
    }

    private String inferNodeKind(Map<String, Object> raw, String id) {
        String placement = asTrimmedString(raw.get("childPlacement"));
        if ("toolbar".equals(placement) || "user-menu".equals(placement)) return "system-directory";
        String linkTarget = asTrimmedString(raw.get("linkTarget"));
        if (!linkTarget.isBlank()) return "link";
        String pageType = asTrimmedString(raw.get("pageType"));
        if ("iframe".equals(pageType) || "new-tab".equals(pageType)) return "link";
        if (!asTrimmedString(raw.get("externalUrl")).isBlank()) return "link";
        if (!asTrimmedString(raw.get("action")).isBlank()) return "system-page";
        String type = asTrimmedString(raw.get("type"));
        if ("group".equals(type)) return "module";
        return "page";
    }

    private boolean isGroupKind(String kind) {
        return "system-directory".equals(kind) || "module".equals(kind);
    }

    private String asTrimmedString(Object value) {
        if (!(value instanceof String str)) return "";
        return str.trim();
    }

    private String normalizePath(String path) {
        if (path == null || path.isBlank()) return "";
        String trimmed = path.trim();
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return trimmed;
        }
        if (!trimmed.startsWith("/")) {
            trimmed = "/" + trimmed;
        }
        if ("/".equals(trimmed)) {
            return "/";
        }
        return trimmed.replaceAll("/+$", "");
    }

    private void putIfNotBlank(Map<String, Object> target, String key, String value) {
        if (value != null && !value.isBlank()) {
            target.put(key, value);
        }
    }

    /** 将 context 值（String / List / Map 等）序列化为 JSON 字符串，null 或序列化失败时返回 null。 */
    private String serializeContext(Object context) {
        if (context == null) return null;
        if (context instanceof String s) return s.isBlank() ? null : s;
        try {
            return objectMapper.writeValueAsString(context);
        } catch (Exception e) {
            log.warn("[Navigation] 序列化 context 失败: {}", e.getMessage());
            return null;
        }
    }



    private HttpResponse<Void> requestHead(HttpClient client, URI uri) throws IOException {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(12))
                .method("HEAD", HttpRequest.BodyPublishers.noBody())
                .header("User-Agent", "Mozilla/5.0")
                .build();
        try {
            return client.send(request, HttpResponse.BodyHandlers.discarding());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("检测请求被中断", e);
        } catch (Exception e) {
            return null;
        }
    }

    private HttpResponse<Void> requestGet(HttpClient client, URI uri) throws IOException {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(12))
                .GET()
                .header("User-Agent", "Mozilla/5.0")
                .build();
        try {
            return client.send(request, HttpResponse.BodyHandlers.discarding());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("检测请求被中断", e);
        } catch (Exception e) {
            throw new IOException("检测请求失败: " + e.getMessage(), e);
        }
    }

    private boolean isDeniedByXfo(String xFrameOptions) {
        String normalized = xFrameOptions == null ? "" : xFrameOptions.toLowerCase();
        return normalized.contains("deny") || normalized.contains("sameorigin");
    }

    private boolean isDeniedByFrameAncestors(String frameAncestors) {
        if (frameAncestors == null || frameAncestors.isBlank()) return false;
        String normalized = frameAncestors.toLowerCase();
        if (normalized.contains("'none'")) return true;
        return !normalized.contains("*");
    }

    private String extractFrameAncestors(String csp) {
        if (csp == null || csp.isBlank()) return "";
        Matcher matcher = FRAME_ANCESTORS_PATTERN.matcher(csp);
        if (!matcher.find()) return "";
        return matcher.group(1).trim();
    }

    private List<Map<String, Object>> fetchFlatRows(String tenantId, String projectId) {
        return jdbcTemplate.queryForList(SELECT_FLAT_SQL, tenantId, projectId);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> buildRootFromFlatRows(List<Map<String, Object>> rows) {
        if (rows == null || rows.isEmpty()) {
            return null;
        }

        List<FlatNode> flatNodes = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String nodeId = asTrimmedString(row.get("NODE_ID"));
            if (nodeId.isBlank()) continue;
            String parentId = asTrimmedString(row.get("PARENT_ID"));
            Integer sortOrder = toInt(row.get("SORT_ORDER"));

            Map<String, Object> node = new LinkedHashMap<>();
            node.put("id", nodeId);

            String title = asTrimmedString(row.get("TITLE"));
            if (!title.isBlank()) node.put("title", title);

            putIfNotBlank(node, "description", asTrimmedString(row.get("DESCRIPTION")));
            putIfNotBlank(node, "nodeKind", asTrimmedString(row.get("NODE_KIND")));
            putIfNotBlank(node, "path", asTrimmedString(row.get("PATH")));
            putIfNotBlank(node, "icon", asTrimmedString(row.get("ICON")));
            putIfNotBlank(node, "childPlacement", asTrimmedString(row.get("CHILD_PLACEMENT")));
            putIfNotBlank(node, "linkTarget", asTrimmedString(row.get("LINK_TARGET")));
            putIfNotBlank(node, "refId", asTrimmedString(row.get("REF_ID")));
            if (sortOrder != null) {
                node.put("sortOrder", sortOrder);
            }

            String contextJson = asTrimmedString(row.get("CONTEXT"));
            if (!contextJson.isBlank()) {
                try {
                    node.put("context", objectMapper.readValue(contextJson, Object.class));
                } catch (Exception e) {
                    log.warn("[Navigation] 解析 context JSON 失败, nodeId={}: {}", nodeId, e.getMessage());
                }
            }

            if (Boolean.TRUE.equals(row.get("DIVIDER_AFTER"))) {
                node.put("dividerAfter", true);
            }
            if (Boolean.TRUE.equals(row.get("HIDDEN"))) {
                node.put("hidden", true);
            }
            if (Boolean.TRUE.equals(row.get("DISABLED"))) {
                node.put("disabled", true);
            }
            // 权限模式：DB null 默认 masked
            String permMode = asTrimmedString(row.get("PERMISSIONS"));
            if ("none".equals(permMode) || "masked".equals(permMode) || "invisible".equals(permMode)) {
                node.put("permissionMode", permMode);
            } else {
                node.put("permissionMode", "masked");
            }

            flatNodes.add(new FlatNode(nodeId, parentId.isBlank() ? null : parentId, sortOrder, node));
        }

        // 按 parentId（NODE_ID 字符串）分组
        Map<String, List<FlatNode>> childrenByParent = new LinkedHashMap<>();
        for (FlatNode fn : flatNodes) {
            String key = fn.parentId() == null ? "" : fn.parentId();
            childrenByParent.computeIfAbsent(key, k -> new ArrayList<>()).add(fn);
        }
        for (List<FlatNode> siblings : childrenByParent.values()) {
            siblings.sort((a, b) -> {
                int aSort = a.sortOrder() == null ? Integer.MAX_VALUE : a.sortOrder();
                int bSort = b.sortOrder() == null ? Integer.MAX_VALUE : b.sortOrder();
                int bySort = Integer.compare(aSort, bSort);
                if (bySort != 0) return bySort;
                return a.nodeId().compareTo(b.nodeId());
            });
        }

        List<Map<String, Object>> rootChildren = new ArrayList<>();
        for (FlatNode rootNode : childrenByParent.getOrDefault("", List.of())) {
            rootChildren.add(buildNodeTree(rootNode, childrenByParent));
        }

        Map<String, Object> root = new LinkedHashMap<>();
        root.put("childPlacement", "header");
        root.put("children", rootChildren);

        String homePath = findHomePath(rootChildren);
        if (!homePath.isBlank()) {
            root.put("homePath", homePath);
        }
        return root;
    }

    private Map<String, Object> buildNodeTree(FlatNode current,
                                               Map<String, List<FlatNode>> childrenByParent) {
        Map<String, Object> node = new LinkedHashMap<>(current.node());
        if (current.parentId() != null) {
            node.put("parentId", current.parentId());
        }
        List<FlatNode> children = childrenByParent.getOrDefault(current.nodeId(), List.of());
        if (!children.isEmpty()) {
            List<Map<String, Object>> childNodes = new ArrayList<>();
            for (FlatNode child : children) {
                childNodes.add(buildNodeTree(child, childrenByParent));
            }
            node.put("children", childNodes);
        }
        return node;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ref 节点解析：将 refId 替换为目标节点的 title/icon/path
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 递归遍历导航树，解析所有 nodeKind="ref" 的节点。
     * <p>
     * 解析策略：
     * - 同项目引用：直接使用目标 path
     * - 跨项目引用：生成 @app:projectId/path 格式，前端 navigateByPath 自动切换项目
     * - 目标不存在/无 path：标记 refBroken=true，前端可展示断链提示
     */
    @SuppressWarnings("unchecked")
    private void resolveRefNodes(Map<String, Object> root, String currentTenantId, String currentProjectId) {
        Object children = root.get("children");
        if (children instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> child) {
                    resolveRefNode((Map<String, Object>) child, currentTenantId, currentProjectId);
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void resolveRefNode(Map<String, Object> node, String currentTenantId, String currentProjectId) {
        // 先递归子节点
        Object children = node.get("children");
        if (children instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> child) {
                    resolveRefNode((Map<String, Object>) child, currentTenantId, currentProjectId);
                }
            }
        }

        // 仅处理 ref 节点
        if (!"ref".equals(node.get("nodeKind"))) return;

        String refId = asTrimmedString(node.get("refId"));
        if (refId.isBlank()) {
            node.put("refBroken", true);
            return;
        }

        // 自引用拦截
        String selfId = asTrimmedString(node.get("id"));
        if (refId.equals(selfId)) {
            node.put("refBroken", true);
            return;
        }

        // 查询目标节点
        List<Map<String, Object>> targets = jdbcTemplate.queryForList(RESOLVE_REF_SQL, refId);
        if (targets.isEmpty()) {
            node.put("refBroken", true);
            return;
        }

        Map<String, Object> target = targets.get(0);
        String targetTenantId = asTrimmedString(target.get("TENANT_ID"));
        String targetKind = asTrimmedString(target.get("NODE_KIND"));

        // 跨租户拦截：只允许同租户内跨工程引用
        if (!currentTenantId.equals(targetTenantId)) {
            node.put("refBroken", true);
            return;
        }

        // ref 只能指向 page 节点
        if (!"page".equals(targetKind)) {
            node.put("refBroken", true);
            return;
        }

        String targetProjectId = asTrimmedString(target.get("PROJECT_ID"));
        String targetPath = asTrimmedString(target.get("PATH"));
        String targetTitle = asTrimmedString(target.get("TITLE"));
        String targetIcon = asTrimmedString(target.get("ICON"));

        // 用目标信息填充（仅覆盖 ref 节点未显式设置的字段）
        if (asTrimmedString(node.get("title")).isBlank() || node.get("title").equals(node.get("id"))) {
            if (!targetTitle.isBlank()) node.put("title", targetTitle);
        }
        if (!node.containsKey("icon") && !targetIcon.isBlank()) {
            node.put("icon", targetIcon);
        }

        // 生成导航路径
        if (!targetPath.isBlank()) {
            boolean sameProject = currentProjectId.equals(targetProjectId);
            if (sameProject) {
                node.put("refPath", targetPath);
            } else {
                node.put("refPath", "@app:" + targetProjectId + targetPath);
                node.put("refProjectId", targetProjectId);
            }
        } else {
            node.put("refBroken", true);
        }

        node.put("refNodeKind", targetKind);
    }

    /**
     * 查找首页路径。优先 DFS 找 id="home" 的节点（向后兼容），
     * 找不到则回退到第一个有路径的 page/system-page 节点。
     */
    private String findHomePath(List<Map<String, Object>> nodes) {
        String byId = findPathByNodeId(nodes, "home");
        if (!byId.isBlank()) return byId;
        return findFirstRoutablePath(nodes);
    }

    /** 全树 DFS 查找指定 id 的节点路径 */
    @SuppressWarnings("unchecked")
    private String findPathByNodeId(List<Map<String, Object>> nodes, String targetId) {
        for (Map<String, Object> node : nodes) {
            String nodeId = asTrimmedString(node.get("id"));
            String path = normalizePath(asTrimmedString(node.get("path")));
            if (targetId.equals(nodeId) && !path.isBlank()) {
                return path;
            }
            Object childValue = node.get("children");
            if (childValue instanceof List<?> childList) {
                String childPath = findPathByNodeId((List<Map<String, Object>>) childList, targetId);
                if (!childPath.isBlank()) {
                    return childPath;
                }
            }
        }
        return "";
    }

    /**
     * 递归查找第一个可路由的页面节点路径（page 或 system-page，有非空 path）。
     * 用于 homePath 回退，当没有 id="home" 节点时自动取首个页面。
     */
    @SuppressWarnings("unchecked")
    private String findFirstRoutablePath(List<Map<String, Object>> nodes) {
        for (Map<String, Object> node : nodes) {
            String kind = asTrimmedString(node.get("nodeKind"));
            // 跳过系统容器（toolbar / user-menu），首页不应从这些区域取
            if ("system-directory".equals(kind)) continue;
            String path = normalizePath(asTrimmedString(node.get("path")));
            if (("page".equals(kind) || "system-page".equals(kind)) && !path.isBlank()) {
                return path;
            }
            Object childValue = node.get("children");
            if (childValue instanceof List<?> childList) {
                String childPath = findFirstRoutablePath((List<Map<String, Object>>) childList);
                if (!childPath.isBlank()) {
                    return childPath;
                }
            }
        }
        return "";
    }

    @SuppressWarnings("unchecked")
    private void replaceFlatRows(String tenantId, String projectId, Map<String, Object> root) {
        jdbcTemplate.update(DELETE_ALL_SQL, tenantId, projectId);

        Object childrenValue = root.get("children");
        if (!(childrenValue instanceof List<?> rawChildren) || rawChildren.isEmpty()) {
            return;
        }

        List<Map<String, Object>> children = (List<Map<String, Object>>) rawChildren;
        insertChildrenRecursively(tenantId, projectId, children, null);
    }

    @SuppressWarnings("unchecked")
    private void insertChildrenRecursively(String tenantId,
                                           String projectId,
                                           List<Map<String, Object>> children,
                                           String parentNodeId) {
        int order = 0;
        for (Map<String, Object> node : children) {
            String nodeId = insertFlatRow(tenantId, projectId, parentNodeId, node, order++);
            Object nested = node.get("children");
            if (nested instanceof List<?> nestedList && !nestedList.isEmpty()) {
                insertChildrenRecursively(
                        tenantId,
                        projectId,
                        (List<Map<String, Object>>) nestedList,
                        nodeId
                );
            }
        }
    }

    private String insertFlatRow(String tenantId,
                               String projectId,
                               String parentNodeId,
                               Map<String, Object> node,
                               int sortOrder) {
        String nodeId = asTrimmedString(node.get("id"));
        if (nodeId.isBlank()) {
            nodeId = "node-" + sortOrder;
        }
        final String effectiveNodeId = nodeId;

        String title = asTrimmedString(node.get("title"));
        String nodeKind = asTrimmedString(node.get("nodeKind"));
        String path = asTrimmedString(node.get("path"));
        String icon = asTrimmedString(node.get("icon"));
        String description = asTrimmedString(node.get("description"));
        String childPlacement = asTrimmedString(node.get("childPlacement"));
        String linkTarget = asTrimmedString(node.get("linkTarget"));
        String refId = asTrimmedString(node.get("refId"));
        Boolean dividerAfter = toBoolean(node.get("dividerAfter"));
        Boolean hidden = toBoolean(node.get("hidden"));
        Boolean disabled = toBoolean(node.get("disabled"));
        final String contextJson = serializeContext(node.get("context"));
        final String effectiveTitle = title.isBlank() ? effectiveNodeId : title;

        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(INSERT_FLAT_SQL);
            statement.setString(1, parentNodeId);
            statement.setString(2, tenantId);
            statement.setString(3, projectId);
            statement.setString(4, effectiveTitle);
            statement.setString(5, description.isBlank() ? null : description);
            statement.setString(6, nodeKind.isBlank() ? null : nodeKind);
            statement.setString(7, path.isBlank() ? null : path);
            statement.setString(8, icon.isBlank() ? null : icon);
            statement.setObject(9, dividerAfter);
            statement.setString(10, childPlacement.isBlank() ? null : childPlacement);
            statement.setString(11, linkTarget.isBlank() ? null : linkTarget);
            statement.setObject(12, hidden);
            statement.setObject(13, disabled);
            statement.setInt(14, sortOrder);
            statement.setString(15, effectiveNodeId);
            statement.setTimestamp(16, Timestamp.from(Instant.now()));
            statement.setString(17, refId.isBlank() ? null : refId);
            statement.setString(18, contextJson);
            statement.setString(19, blankToNull(asTrimmedString(node.get("permissionMode"))));
            return statement;
        });

        return effectiveNodeId;
    }

    private Integer toInt(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            return Integer.parseInt(text);
        }
        return null;
    }

    private Boolean toBoolean(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof String text && !text.isBlank()) {
            return Boolean.parseBoolean(text);
        }
        return null;
    }

    private boolean isSystemRootDirectory(String nodeId) {
        var rows = jdbcTemplate.queryForList(CHECK_SYSTEM_ROOT_SQL, nodeId);
        if (rows.isEmpty()) return false;
        var row = rows.get(0);
        return "system-directory".equals(asTrimmedString(row.get("NODE_KIND")))
            && asTrimmedString(row.get("PARENT_ID")).isBlank();
    }

    private String trimOrNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isBlank() ? null : trimmed;
    }

    private String blankToNull(String value) {
        return (value == null || value.isBlank()) ? null : value;
    }

    // ── 增量 CRUD 辅助方法（全部基于 NODE_ID 字符串）──────────────────────

    /** 检查 NODE_ID 是否存在。 */
    private boolean nodeExists(String tenantId, String projectId, String nodeId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                EXISTS_NODE_SQL, tenantId, projectId, nodeId);
        return !rows.isEmpty();
    }

    /** 获取同级下一个可用排序值。parentNodeId 为 null 表示根级。 */
    private int nextSortOrder(String tenantId, String projectId, String parentNodeId) {
        String sql = String.format(MAX_SORT_ORDER_SQL,
                parentNodeId == null ? "IS NULL" : "= ?");
        Integer next;
        if (parentNodeId == null) {
            next = jdbcTemplate.queryForObject(sql, Integer.class, tenantId, projectId);
        } else {
            next = jdbcTemplate.queryForObject(sql, Integer.class, tenantId, projectId, parentNodeId);
        }
        return next != null ? next : 0;
    }

    /** 在指定父节点下，将 SORT_ORDER >= index 的节点全部 +1，腾出位置。 */
    private void shiftSortOrders(String tenantId, String projectId, String parentNodeId, int index) {
        String sql = String.format(SHIFT_SORT_ORDER_SQL,
                parentNodeId == null ? "IS NULL" : "= ?");
        if (parentNodeId == null) {
            jdbcTemplate.update(sql, tenantId, projectId, index);
        } else {
            jdbcTemplate.update(sql, tenantId, projectId, parentNodeId, index);
        }
    }

    /** 递归删除节点及其所有子孙。 */
    private void deleteNodeRecursive(String tenantId, String projectId, String nodeId) {
        List<String> childNodeIds = jdbcTemplate.query(
                SELECT_CHILDREN_SQL,
                (rs, rowNum) -> rs.getString("NODE_ID"),
                tenantId, projectId, nodeId);
        for (String childId : childNodeIds) {
            deleteNodeRecursive(tenantId, projectId, childId);
        }
        jdbcTemplate.update(DELETE_BY_NODE_ID_SQL, tenantId, projectId, nodeId);
    }

    /** 判断 targetNodeId 是否是 ancestorNodeId 的子孙（防循环移动）。 */
    private boolean isDescendantOf(String tenantId, String projectId,
                                    String ancestorNodeId, String targetNodeId) {
        List<String> childNodeIds = jdbcTemplate.query(
                SELECT_CHILDREN_SQL,
                (rs, rowNum) -> rs.getString("NODE_ID"),
                tenantId, projectId, ancestorNodeId);
        for (String childId : childNodeIds) {
            if (childId.equals(targetNodeId)) return true;
            if (isDescendantOf(tenantId, projectId, childId, targetNodeId)) return true;
        }
        return false;
    }

}
