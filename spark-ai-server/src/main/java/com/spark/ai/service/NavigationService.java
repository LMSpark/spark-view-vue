package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.entity.ProjectEntity;
import com.spark.ai.repository.ProjectRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.sql.PreparedStatement;
import java.sql.Statement;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 导航配置持久化服务（NAVIGATION_NODE_FLAT）— 按 (tenantId, projectId) 隔离。
 */
@Service
public class NavigationService {

    private record FlatNode(Long id, Long pid, Integer sortOrder, Map<String, Object> node) {}

    private static final Logger log = LoggerFactory.getLogger(NavigationService.class);
    private static final String DEFAULT_HOME_PATH = "/dashboard";
    private static final List<String> SYSTEM_ROOT_DIRECTORY_IDS = List.of("__toolbar__", "__user-menu__");
    private static final Pattern FRAME_ANCESTORS_PATTERN = Pattern.compile("frame-ancestors\\s+([^;]+)", Pattern.CASE_INSENSITIVE);
    private static final Set<String> VALID_NODE_KINDS = Set.of("system-directory", "module", "system-page", "system-action", "page", "link", "sub-page");
    private static final Set<String> VALID_CHILD_PLACEMENTS = Set.of("header", "sidebar", "toolbar", "user-menu", "parent", "flat");
    private static final String SELECT_FLAT_SQL = """
        SELECT ID, PID, TITLE, DESCRIPTION, NODEKIND, PATH, ICON,
           DIVIDERAFTER, CHILDPLACEMENT, LINKTARGET,
           HIDDEN, DISABLED, SORTORDER, LEGACYNODEIDREMARK, REFID
        FROM NAVIGATION_NODE_FLAT
        WHERE TENANTID = ? AND PROJECTID = ?
        ORDER BY COALESCE(PID, 0), SORTORDER, ID
        """;
    private static final String DELETE_FLAT_SQL = """
        DELETE FROM NAVIGATION_NODE_FLAT
        WHERE TENANTID = ? AND PROJECTID = ?
        """;
    private static final String CLEAR_PARENT_SQL = """
        UPDATE NAVIGATION_NODE_FLAT
        SET PID = NULL
        WHERE TENANTID = ? AND PROJECTID = ?
        """;
    private static final String INSERT_FLAT_SQL = """
        INSERT INTO NAVIGATION_NODE_FLAT (
        PID, TENANTID, PROJECTID,
        TITLE, DESCRIPTION, NODEKIND, PATH, ICON,
        DIVIDERAFTER, CHILDPLACEMENT, LINKTARGET,
        HIDDEN, DISABLED, SORTORDER,
        LEGACYNODEIDREMARK, UPDATEDAT, REFID, NAV_PROJECT_ID
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """;
    private static final String SELECT_LEGACY_ID_BY_DB_ID_SQL = """
        SELECT LEGACYNODEIDREMARK
        FROM NAVIGATION_NODE_FLAT
        WHERE TENANTID = ? AND PROJECTID = ? AND ID = ?
        """;

    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;
    private final ProjectRepository projectRepository;

    public NavigationService(ObjectMapper objectMapper,
                             JdbcTemplate jdbcTemplate,
                             ProjectRepository projectRepository) {
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
        this.projectRepository = projectRepository;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 整树读写
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 读取导航配置（完整树）。
     */
    public Map<String, Object> getNavConfig(String tenantId, String projectId) throws IOException {
        List<Map<String, Object>> rows = fetchFlatRows(tenantId, projectId);
        return buildRootFromFlatRows(rows);
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
     * 新增节点。
     *
     * @param parentId 父节点 id；为 null 则追加到根 children
     * @param node     要插入的节点对象（必须含 id、title）
     * @param index    插入位置（-1 表示追加到末尾）
     * @throws IllegalArgumentException 若 id 已存在或父节点不存在
     */
    @Transactional
    public Map<String, Object> addNode(String tenantId, String projectId,
                                        String parentId,
                                        Map<String, Object> node,
                                        int index) throws IOException {
        Map<String, Object> root = loadOrInit(tenantId, projectId);
        List<Map<String, Object>> rootChildren = getChildren(root);

        // 校验：id 不能重复
        String newId = String.valueOf(node.getOrDefault("id", ""));
        if (newId.isBlank()) throw new IllegalArgumentException("节点 id 不能为空");
        if (findById(rootChildren, newId) != null) {
            throw new IllegalArgumentException("节点 id 已存在: " + newId);
        }

        List<Map<String, Object>> targetList;
        String resolvedParentId = parentId;
        if (resolvedParentId != null && !resolvedParentId.isBlank()) {
            resolvedParentId = resolveNodeLookupId(tenantId, projectId, resolvedParentId);
        }

        if (resolvedParentId == null || resolvedParentId.isBlank()) {
            targetList = rootChildren;
        } else {
            Map<String, Object> parent = findById(rootChildren, resolvedParentId);
            if (parent == null) throw new IllegalArgumentException("父节点不存在: " + resolvedParentId);
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

        persistTree(tenantId, projectId, root);
        log.info("[Navigation] 新增节点 id={} tenant={} project={}", newId, tenantId, projectId);
        return node;
    }

    @Transactional
    public Map<String, Object> updateNode(String tenantId, String projectId,
                                           String id,
                                           Map<String, Object> patch) throws IOException {
        String lookupId = resolveNodeLookupId(tenantId, projectId, id);
        if (isSystemRootDirectoryId(lookupId)) {
            throw new IllegalArgumentException("系统目录不可修改目录属性，仅可编辑子项: " + lookupId);
        }
        Map<String, Object> root = loadOrInit(tenantId, projectId);
        Map<String, Object> node = findById(getChildren(root), lookupId);
        if (node == null) throw new IllegalArgumentException("节点不存在: " + id);

        // 合并 patch（保留 children，不允许通过此接口覆盖子树）
        for (Map.Entry<String, Object> entry : patch.entrySet()) {
            if (!"children".equals(entry.getKey())) {
                node.put(entry.getKey(), entry.getValue());
            }
        }

        persistTree(tenantId, projectId, root);
        log.info("[Navigation] 更新节点 id={} lookupId={} tenant={} project={}", id, lookupId, tenantId, projectId);
        return node;
    }

    @Transactional
    public Map<String, Object> deleteNode(String tenantId, String projectId,
                                           String id) throws IOException {
        String lookupId = resolveNodeLookupId(tenantId, projectId, id);
        if (isSystemRootDirectoryId(lookupId)) {
            throw new IllegalArgumentException("系统目录不可删除: " + lookupId);
        }
        Map<String, Object> root = loadOrInit(tenantId, projectId);
        List<Map<String, Object>> rootChildren = getChildren(root);
        Map<String, Object>[] result = new Map[]{null};

        boolean removed = removeById(rootChildren, lookupId, result);
        if (!removed) throw new IllegalArgumentException("节点不存在: " + id);

        persistTree(tenantId, projectId, root);
        log.info("[Navigation] 删除节点 id={} lookupId={} tenant={} project={}", id, lookupId, tenantId, projectId);
        return result[0];
    }

    @Transactional
    public Map<String, Object> moveNode(String tenantId, String projectId,
                                         String id, String newParentId,
                                         int index) throws IOException {
        String lookupId = resolveNodeLookupId(tenantId, projectId, id);
        if (isSystemRootDirectoryId(lookupId)) {
            throw new IllegalArgumentException("系统目录不可修改层级: " + lookupId);
        }
        Map<String, Object> root = loadOrInit(tenantId, projectId);
        List<Map<String, Object>> rootChildren = getChildren(root);
        String resolvedNewParentId = newParentId;
        if (resolvedNewParentId != null && !resolvedNewParentId.isBlank()) {
            resolvedNewParentId = resolveNodeLookupId(tenantId, projectId, resolvedNewParentId);
        }

        // 防止移动到自身的子孙节点下
        if (resolvedNewParentId != null && !resolvedNewParentId.isBlank()) {
            Map<String, Object> moving = findById(rootChildren, lookupId);
            if (moving == null) throw new IllegalArgumentException("节点不存在: " + id);
            if (isDescendant(moving, resolvedNewParentId)) {
                throw new IllegalArgumentException("不能将节点移动到其自身的子孙节点下");
            }
        }

        // 先摘除
        Map<String, Object>[] result = new Map[]{null};
        if (!removeById(rootChildren, lookupId, result)) {
            throw new IllegalArgumentException("节点不存在: " + id);
        }
        Map<String, Object> node = result[0];

        // 再插入
        List<Map<String, Object>> targetList;
        if (resolvedNewParentId == null || resolvedNewParentId.isBlank()) {
            targetList = getChildren(root);
        } else {
            Map<String, Object> parent = findById(getChildren(root), resolvedNewParentId);
            if (parent == null) throw new IllegalArgumentException("目标父节点不存在: " + resolvedNewParentId);
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

        persistTree(tenantId, projectId, root);
        log.info("[Navigation] 移动节点 id={} lookupId={} newParentId={} resolvedNewParentId={} tenant={} project={}",
            id, lookupId, newParentId, resolvedNewParentId, tenantId, projectId);
        return node;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 扁平化列表
    // ─────────────────────────────────────────────────────────────────────────

    public List<Map<String, Object>> listNodes(String tenantId, String projectId) throws IOException {
        return fetchFlatRows(tenantId, projectId);
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
            item.put("nodeKind", node.getOrDefault("nodeKind", ""));
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
                if ("__toolbar__".equals(id)) {
                    node.put("childPlacement", "toolbar");
                } else if ("__user-menu__".equals(id)) {
                    node.put("childPlacement", "user-menu");
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
        if (isSystemRootDirectoryId(id)) {
            return "system-directory";
        }

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
        if (isSystemRootDirectoryId(id)) return "system-directory";
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
            Long id = toLong(row.get("ID"));
            if (id == null) continue;
            Long pid = toLong(row.get("PID"));
            Integer sortOrder = toInt(row.get("SORTORDER"));

            Map<String, Object> node = new LinkedHashMap<>();
            node.put("id", String.valueOf(id));

            String title = asTrimmedString(row.get("TITLE"));
            if (!title.isBlank()) node.put("title", title);

            putIfNotBlank(node, "description", asTrimmedString(row.get("DESCRIPTION")));
            putIfNotBlank(node, "nodeKind", asTrimmedString(row.get("NODEKIND")));
            putIfNotBlank(node, "path", asTrimmedString(row.get("PATH")));
            putIfNotBlank(node, "icon", asTrimmedString(row.get("ICON")));
            putIfNotBlank(node, "childPlacement", asTrimmedString(row.get("CHILDPLACEMENT")));
            putIfNotBlank(node, "linkTarget", asTrimmedString(row.get("LINKTARGET")));
            putIfNotBlank(node, "refId", asTrimmedString(row.get("REFID")));

            if (Boolean.TRUE.equals(row.get("DIVIDERAFTER"))) {
                node.put("dividerAfter", true);
            }
            if (Boolean.TRUE.equals(row.get("HIDDEN"))) {
                node.put("hidden", true);
            }
            if (Boolean.TRUE.equals(row.get("DISABLED"))) {
                node.put("disabled", true);
            }

            flatNodes.add(new FlatNode(id, pid, sortOrder, node));
        }

        Map<Long, List<FlatNode>> childrenByPid = new LinkedHashMap<>();
        for (FlatNode node : flatNodes) {
            childrenByPid.computeIfAbsent(node.pid(), key -> new ArrayList<>()).add(node);
        }
        for (List<FlatNode> siblings : childrenByPid.values()) {
            siblings.sort((a, b) -> {
                int aSort = a.sortOrder() == null ? Integer.MAX_VALUE : a.sortOrder();
                int bSort = b.sortOrder() == null ? Integer.MAX_VALUE : b.sortOrder();
                int bySort = Integer.compare(aSort, bSort);
                if (bySort != 0) return bySort;
                return Long.compare(a.id(), b.id());
            });
        }

        List<Map<String, Object>> rootChildren = new ArrayList<>();
        for (FlatNode rootNode : childrenByPid.getOrDefault(null, List.of())) {
            rootChildren.add(buildNodeTree(rootNode, childrenByPid));
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
                                               Map<Long, List<FlatNode>> childrenByPid) {
        Map<String, Object> node = new LinkedHashMap<>(current.node());
        List<FlatNode> children = childrenByPid.getOrDefault(current.id(), List.of());
        if (!children.isEmpty()) {
            List<Map<String, Object>> childNodes = new ArrayList<>();
            for (FlatNode child : children) {
                childNodes.add(buildNodeTree(child, childrenByPid));
            }
            node.put("children", childNodes);
        }
        return node;
    }

    @SuppressWarnings("unchecked")
    private String findHomePath(List<Map<String, Object>> nodes) {
        for (Map<String, Object> node : nodes) {
            String nodeId = asTrimmedString(node.get("id"));
            String path = normalizePath(asTrimmedString(node.get("path")));
            if ("home".equals(nodeId) && !path.isBlank()) {
                return path;
            }
            Object childValue = node.get("children");
            if (childValue instanceof List<?> childList) {
                String childPath = findHomePath((List<Map<String, Object>>) childList);
                if (!childPath.isBlank()) {
                    return childPath;
                }
            }
        }
        return "";
    }

    @SuppressWarnings("unchecked")
    private void replaceFlatRows(String tenantId, String projectId, Map<String, Object> root) {
        Long projectDbId = resolveProjectDbId(tenantId, projectId);

        jdbcTemplate.update(CLEAR_PARENT_SQL, tenantId, projectId);
        jdbcTemplate.update(DELETE_FLAT_SQL, tenantId, projectId);

        Object childrenValue = root.get("children");
        if (!(childrenValue instanceof List<?> rawChildren) || rawChildren.isEmpty()) {
            return;
        }

        List<Map<String, Object>> children = (List<Map<String, Object>>) rawChildren;
        insertChildrenRecursively(tenantId, projectId, projectDbId, children, null);
    }

    @SuppressWarnings("unchecked")
    private void insertChildrenRecursively(String tenantId,
                                           String projectId,
                                           Long projectDbId,
                                           List<Map<String, Object>> children,
                                           Long parentId) {
        int order = 0;
        for (Map<String, Object> node : children) {
            Long rowId = insertFlatRow(tenantId, projectId, projectDbId, parentId, node, order++);
            Object nested = node.get("children");
            if (nested instanceof List<?> nestedList && !nestedList.isEmpty()) {
                insertChildrenRecursively(
                        tenantId,
                        projectId,
                        projectDbId,
                        (List<Map<String, Object>>) nestedList,
                        rowId
                );
            }
        }
    }

    private Long insertFlatRow(String tenantId,
                               String projectId,
                               Long projectDbId,
                               Long parentId,
                               Map<String, Object> node,
                               int sortOrder) {
        String legacyNodeId = asTrimmedString(node.get("id"));
        if (legacyNodeId.isBlank()) {
            legacyNodeId = "node-" + sortOrder;
        }
        final String normalizedLegacyNodeId = legacyNodeId;

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
        final String effectiveTitle = title.isBlank() ? normalizedLegacyNodeId : title;

        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(INSERT_FLAT_SQL, Statement.RETURN_GENERATED_KEYS);
            statement.setObject(1, parentId);
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
            statement.setString(15, normalizedLegacyNodeId);
            statement.setTimestamp(16, Timestamp.from(Instant.now()));
            statement.setString(17, refId.isBlank() ? null : refId);
            statement.setLong(18, projectDbId);
            return statement;
        }, keyHolder);

        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("写入 NAVIGATION_NODE_FLAT 失败：未返回主键");
        }
        return key.longValue();
    }

    private Long resolveProjectDbId(String tenantId, String projectId) {
        return projectRepository.findByTenantIdAndProjectId(tenantId, projectId)
                .map(ProjectEntity::getId)
                .orElseThrow(() -> new IllegalArgumentException("项目不存在: " + tenantId + "/" + projectId));
    }

    private Long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            return Long.parseLong(text);
        }
        return null;
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

    private boolean isSystemRootDirectoryId(String id) {
        return SYSTEM_ROOT_DIRECTORY_IDS.contains(id);
    }

    private String resolveNodeLookupId(String tenantId, String projectId, String idOrDbId) {
        String candidate = idOrDbId == null ? "" : idOrDbId.trim();
        if (candidate.isBlank()) {
            return candidate;
        }

        Long dbId = parseLongOrNull(candidate);
        if (dbId == null) {
            return candidate;
        }

        List<String> ids = jdbcTemplate.query(
                SELECT_LEGACY_ID_BY_DB_ID_SQL,
                (rs, rowNum) -> rs.getString("LEGACYNODEIDREMARK"),
                tenantId,
                projectId,
                dbId
        );

        if (ids.isEmpty()) {
            return candidate;
        }

        String legacyId = ids.get(0) == null ? "" : ids.get(0).trim();
        return legacyId.isBlank() ? candidate : legacyId;
    }

    private Long parseLongOrNull(String text) {
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException e) {
            return null;
        }
    }

}
