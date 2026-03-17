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
 * 导航配置持久化服务 — 按 (tenantId, projectId) 隔离。
 */
@Service
public class NavigationService {

    private static final Logger log = LoggerFactory.getLogger(NavigationService.class);
    private static final List<String> SYSTEM_ROOT_DIRECTORY_IDS = List.of("__toolbar__", "__user-menu__");
    private static final Pattern FRAME_ANCESTORS_PATTERN = Pattern.compile("frame-ancestors\\s+([^;]+)", Pattern.CASE_INSENSITIVE);
    private static final Set<String> VALID_NODE_KINDS = Set.of("system-directory", "module", "system-page", "page", "link", "sub-page");
    private static final Set<String> VALID_CHILD_PLACEMENTS = Set.of("header", "sidebar", "toolbar", "user-menu", "parent", "flat");

    private final NavigationConfigRepository navRepo;
    private final ObjectMapper objectMapper;

    public NavigationService(NavigationConfigRepository navRepo,
                              ObjectMapper objectMapper) {
        this.navRepo = navRepo;
        this.objectMapper = objectMapper;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 整树读写
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 读取导航配置（完整树）。
     */
    public Map<String, Object> getNavConfig(String tenantId, String projectId) throws IOException {
        return navRepo.findByTenantIdAndProjectId(tenantId, projectId)
                .map(entity -> {
                    try {
                        return objectMapper.readValue(entity.getConfigJson(),
                                new TypeReference<Map<String, Object>>() {});
                    } catch (IOException e) {
                        log.error("[Navigation] JSON 解析失败 tenant={} project={}", tenantId, projectId, e);
                        return null;
                    }
                })
                .orElse(null);
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

        persistTree(tenantId, projectId, root);
        log.info("[Navigation] 新增节点 id={} tenant={} project={}", newId, tenantId, projectId);
        return node;
    }

    @Transactional
    public Map<String, Object> updateNode(String tenantId, String projectId,
                                           String id,
                                           Map<String, Object> patch) throws IOException {
        if (isSystemRootDirectoryId(id)) {
            throw new IllegalArgumentException("系统目录不可修改目录属性，仅可编辑子项: " + id);
        }
        Map<String, Object> root = loadOrInit(tenantId, projectId);
        Map<String, Object> node = findById(getChildren(root), id);
        if (node == null) throw new IllegalArgumentException("节点不存在: " + id);

        // 合并 patch（保留 children，不允许通过此接口覆盖子树）
        for (Map.Entry<String, Object> entry : patch.entrySet()) {
            if (!"children".equals(entry.getKey())) {
                node.put(entry.getKey(), entry.getValue());
            }
        }

        persistTree(tenantId, projectId, root);
        log.info("[Navigation] 更新节点 id={} tenant={} project={}", id, tenantId, projectId);
        return node;
    }

    @Transactional
    public Map<String, Object> deleteNode(String tenantId, String projectId,
                                           String id) throws IOException {
        if (isSystemRootDirectoryId(id)) {
            throw new IllegalArgumentException("系统目录不可删除: " + id);
        }
        Map<String, Object> root = loadOrInit(tenantId, projectId);
        List<Map<String, Object>> rootChildren = getChildren(root);
        Map<String, Object>[] result = new Map[]{null};

        boolean removed = removeById(rootChildren, id, result);
        if (!removed) throw new IllegalArgumentException("节点不存在: " + id);

        persistTree(tenantId, projectId, root);
        log.info("[Navigation] 删除节点 id={} tenant={} project={}", id, tenantId, projectId);
        return result[0];
    }

    @Transactional
    public Map<String, Object> moveNode(String tenantId, String projectId,
                                         String id, String newParentId,
                                         int index) throws IOException {
        if (isSystemRootDirectoryId(id)) {
            throw new IllegalArgumentException("系统目录不可修改层级: " + id);
        }
        Map<String, Object> root = loadOrInit(tenantId, projectId);
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

        persistTree(tenantId, projectId, root);
        log.info("[Navigation] 移动节点 id={} tenant={} project={}", id, tenantId, projectId);
        return node;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 扁平化列表
    // ─────────────────────────────────────────────────────────────────────────

    public List<Map<String, Object>> listNodes(String tenantId, String projectId) throws IOException {
        Map<String, Object> config = getNavConfig(tenantId, projectId);
        if (config == null) return List.of();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> children = (List<Map<String, Object>>) config.get("children");
        return children == null ? List.of() : flattenNodes(children, null);
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
        persistJson(tenantId, projectId,
                objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(root));
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
                putIfNotBlank(node, "path", normalizePath(asTrimmedString(raw.get("path"))));
                putIfNotBlank(node, "redirect", normalizePath(asTrimmedString(raw.get("redirect"))));
                if ("system-page".equals(kind)) {
                    putIfNotBlank(node, "action", asTrimmedString(raw.get("action")));
                }
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

    private void persistJson(String tenantId, String projectId, String json) {
        NavigationConfigEntity entity = navRepo.findByTenantIdAndProjectId(tenantId, projectId)
                .orElseGet(() -> {
                    NavigationConfigEntity e = new NavigationConfigEntity();
                    e.setTenantId(tenantId);
                    e.setProjectId(projectId);
                    return e;
                });
        entity.setConfigJson(json);
        navRepo.save(entity);
    }

    private boolean isSystemRootDirectoryId(String id) {
        return SYSTEM_ROOT_DIRECTORY_IDS.contains(id);
    }

}
