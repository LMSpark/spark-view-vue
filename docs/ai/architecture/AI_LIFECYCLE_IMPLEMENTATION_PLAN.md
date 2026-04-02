# SPARK AI 全生命周期 —— 分阶段详细实施方案

> **归档说明**：本文依赖旧的 `AiDesignStudio` / `design-session` 规划前提，现已不再作为现行实现依据；保留仅用于历史对照。

> **前置文档**：`AI_DRIVEN_FULL_LIFECYCLE_SOLUTION.md`（总体架构设计）
>
> **本文定位**：可落地的实施指南——对每个开发阶段给出 DB Schema、REST API、Prompt 模板、前端 UI 组件、渐进式切入点的完整规格

---

## 〇、实施总纲

### 分期策略

| 期次 | 名称 | 周期 | 核心交付 | 渐进式切入点 |
|------|------|------|---------|-------------|
| **Phase-A** | 单页增强 | 4 周 | 导航自注册 + 配置验证器 + Prompt 分层架构 | 现有单页面生成体验不变，自动挂导航 |
| **Phase-B** | 蓝图+数据 | 6 周 | 应用蓝图 + DB Schema 生成 + API 配置 + 模板库 | 用户说"做一个XX系统"时触发蓝图流程 |
| **Phase-C** | 多页编排 | 6 周 | 多页面批量生成 + 权限配置 + 声明式交互 | 蓝图确认后一键生成整模块 |
| **Phase-D** | 版本+变更 | 6 周 | 版本管理 + 需求变更分析执行 + 回归验证 | 用户说"改一下XX"时触发变更流程 |

### 依赖关系

```
Phase-A ──→ Phase-B ──→ Phase-C ──→ Phase-D
  │            │           │
  │  Prompt 分层  │  蓝图 Entity │  版本 Entity
  │  验证器基座    │  模板引擎      │  变更 Entity
  └──────────────┴──────────────┴─── 全部可独立上线
```

> **关键原则**：每期末交付物可独立上线、独立产生价值。Phase-A 上线后，即使 B/C/D 全部延期，用户体验也比现在更好。

---

## Phase-A：单页增强（4 周）

### A1. Prompt 分层架构（Week 1-2）

#### A1.1 分层 Prompt 存储

现有 `system-prompt.txt` 约 800 行，职责过重。拆分为分层文件：

```
spark-ai-server/src/main/resources/prompts/
├── layer-0-base.txt            ← 输出协议 + 通用规则（从现有 system-prompt.txt 提取）
├── layer-4-ui.txt              ← rule.json + style.css 规范（现有核心，Phase-1 注入）
├── layer-4-data.txt            ← pagedata.json + script.js 规范（现有核心，Phase-2 注入）
└── system-prompt.txt           ← 保留：作为 layer-0 + layer-4-ui + layer-4-data 的合并兼容入口
```

> Phase-B/C/D 再逐步新增 layer-1（蓝图）、layer-2（数据模型）等，此阶段仅做基础设施拆分。

#### A1.2 Prompt 加载服务

**新增 Java 文件**：`PromptLayerService.java`

```java
@Service
public class PromptLayerService {

    // 按 scope 动态组装 prompt
    // scope = "page" → layer-0 + layer-4-ui + layer-4-data + skill
    // scope = "blueprint" → layer-0 + layer-1 (Phase-B 才有)
    // scope = "module" → layer-0 + all layers + skill
    public String buildPrompt(String scope, String phase, String skillPrompt) {
        List<String> layers = new ArrayList<>();
        layers.add(loadLayer("layer-0-base"));

        switch (scope) {
            case "page" -> {
                if ("phase-1".equals(phase)) layers.add(loadLayer("layer-4-ui"));
                if ("phase-2".equals(phase)) layers.add(loadLayer("layer-4-data"));
            }
            // Phase-B+ 扩展点
        }

        if (skillPrompt != null) layers.add(skillPrompt);
        return String.join("\n\n---\n\n", layers);
    }

    private String loadLayer(String name) {
        // 从 classpath:prompts/{name}.txt 加载，带缓存
    }
}
```

**改造 `AiPageService.buildSystemPrompt()`**：

```java
// 现有（Phase-A 保持兼容）
private String buildSystemPrompt(AiChatRequest request) {
    // 委托给 PromptLayerService，scope="page"
    String skillPrompt = resolveSkillPrompt(request);
    return promptLayerService.buildPrompt("page", request.getPhase(), skillPrompt);
}
```

#### A1.3 layer-0-base.txt 模板

```text
# SPARK 页面配置 AI 生成系统

## 输出协议

你是 SPARK 配置生成助手。根据用户需求生成页面配置文件。

### 响应格式（严格遵守）

以 JSON 格式返回，结构如下：
```json
{
  "files": {
    "rule.json": "...",
    "pagedata.json": "...",
    "script.js": "...",
    "style.css": "..."
  },
  "explanation": "对本次生成的中文说明",
  "needsIteration": false
}
```

### 通用规则

1. **中文优先**：所有 label、title、placeholder、explanation 使用中文
2. **配置驱动**：优先用配置表达需求，减少 script.js 代码量
3. **DataKey 格式**：`{tableName}@{field}` 或 `{tableName}@{viewId}@{field}`
4. **组件类型**：使用 kebab-case（如 `r-table`、`el-input`）
5. **自检清单**：生成后自检以下项目：
   - 所有 dataKey 引用的表在 pagedata.json 中存在
   - 所有事件处理函数在 script.js 中存在
   - 所有 Render* 组件在 script.js 中有对应函数
   - DataRelation 的父/子表和字段都存在
   - 有级联关系的表定义了 isPrimaryKey 列
6. **needsIteration**：若对生成质量不确定，设为 true 触发自动迭代

### 组件优先级

优先使用 SPARK 渲染容器（r-table / r-form / r-tree 等），它们自动处理 DataView 绑定。
仅在 r-* 不支持的场景下使用 Element Plus 原生组件。
```

#### A1.4 layer-4-ui.txt 模板（Phase-1 专用）

```text
# Phase-1：UI 层生成规范

本阶段生成 `rule.json`（页面结构）和 `style.css`（页面样式）。

## rule.json 规范

### 根结构
rule.json 是一个 JSON 数组，每个元素是规则对象：
```json
[
  {
    "type": "组件类型（kebab-case）",
    "name": "字段绑定名（可选，与 DataView 行字段对应）",
    "props": { "组件 props" },
    "style": { "CSS 样式对象" },
    "class": "CSS 类名",
    "children": [ "子规则数组" ]
  }
]
```

### 容器组件（自解析 DataKey）

| 组件 | 用途 | 必需 props |
|------|------|-----------|
| `r-table` | 数据表格 | `dataKey`（如 `Users@rows`） |
| `r-form` | 数据表单 | `dataKey`（如 `Users@currentRow`） |
| `r-detail` | 只读详情 | `dataKey`（如 `Users@currentRow`） |
| `r-tree` | 树形控件 | `dataKey`（如 `TreeData@rows`） |

**r-table 常用 props（必须显式声明）**：
- `border: true` —— 表格边框
- `stripe: true` —— 斑马纹
- `highlightCurrentRow: true` —— 当前行高亮（⚠️ 每个需要高亮的表必须单独声明）

### 字段组件（在容器内使用）

| 组件 | 用途 | 关键 props |
|------|------|-----------|
| `r-text` | 文本字段 | `name`, `label` |
| `r-number` | 数字字段 | `name`, `label`, `precision` |
| `r-select` | 下拉选择 | `name`, `label`, `options` |
| `r-date` | 日期选择 | `name`, `label`, `format` |
| `r-switch` | 开关 | `name`, `label` |

### 布局规范

- 主从表布局使用 `display: flex`，主表和从表各占 `flex: 1`
- 表单使用 el-form + r-* 字段组件
- 工具栏使用 `div` + `display: flex` + `gap: 8px`
- 弹窗使用 `r-dialog` 或 `el-dialog`

### el-table-column 规范

在 `r-table` 内使用 `el-table-column` 定义列：
```json
{
  "type": "el-table-column",
  "props": { "prop": "字段名", "label": "显示名", "width": 120 }
}
```

## style.css 规范

- 选择器以 `[data-page="{{pageId}}"]` 为前缀（CSS 作用域隔离）
- 使用 CSS 变量（如 `var(--el-color-primary)`）保证主题一致性
- 常用模式：
  ```css
  [data-page="my-page"] .toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
  [data-page="my-page"] .main-content { display: flex; gap: 16px; height: calc(100vh - 120px); }
  ```
```

#### A1.5 layer-4-data.txt 模板（Phase-2 专用）

```text
# Phase-2：数据 + 行为层生成规范

本阶段生成 `pagedata.json`（数据结构）和 `script.js`（交互行为）。
Phase-1 已生成的 rule.json 会作为上下文提供。

## pagedata.json 规范

### 根结构（DataSet 配置）
```json
{
  "dataSetName": "PageDS",
  "tables": {
    "表名": {
      "tableName": "表名",
      "columns": [ { "name": "字段名", "type": "string|number|boolean|datetime", "label": "显示名" } ],
      "rows": [ { "字段": "示例值" } ],
      "api": { "list": { "url": "/api/xxx", "method": "GET" } }
    }
  },
  "tableRelations": [
    {
      "parentTable": "父表", "childTable": "子表",
      "parentField": "id", "childField": "parentId",
      "parentViewId": "default",
    }
  ]
}
```

### 列定义必备字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 字段名（与 rule.json 中 prop/name 对应） |
| `type` | string | `string`/`number`/`boolean`/`datetime` |
| `label` | string | 中文标签 |
| `isPrimaryKey` | boolean | 主键标记（有级联关系的表必须定义） |
| `computeExpression` | string | 计算列表达式（可选） |

### 计算列表达式

- **单表达式**：`"price * qty"` — 框架自动包裹 return
- **多语句**：`"if (score >= 90) return 'A'; return 'C';"` — 所有分支必须 return
- **子表聚合**：`"$sum('Items', 'amount')"` — 需配置 DataRelation

### 视图级聚合（aggregates）

```json
{
  "tables": {
    "Orders": {
      "aggregates": {
        "price": { "type": "sum" },
        "score": { "type": "avg" }
      }
    }
  }
}
```

## script.js 规范

### 沙箱环境

script.js 运行在 `with(__ctx)` 沙箱中，可直接使用以下注入变量：
- `$dataSet` — 页面级 DataSet（数据唯一入口）
- `$page` — UI 服务（showMessage/showConfirm/showDialog/showAlert）
- `$route` — 路由快照（path/params/query）
- `$el()` — 页面容器 DOM
- `$query()` / `$queryAll()` — DOM 查询
- `$refreshData()` — 刷新数据
- `h` — Vue 渲染函数（Render* 函数专用）
- `SparkData` — 数据工具命名空间

### 必须包含 `__init__` 函数

```javascript
function __init__() {
  // 页面加载入口，$dataSet 已就绪
  // 在此注册数据订阅、初始化 UI 状态
}
```

### 禁止事项

- ❌ `import` 语句（沙箱不支持 ESM）
- ❌ `ElMessage` / `ElMessageBox`（用 `$page.showMessage` / `$page.showConfirm`）
- ❌ `window.xxx = function`（不需要挂 window）
- ❌ `$data`（已删除，用 `$dataSet`）

### 树页面特殊约束

包含 r-tree 的页面：
- ✅ 用 `DataView.replaceRows()` 驱动数据变更
- ✅ 用 `$query` + DOM 直写更新面板信息
```

---

### A2. 导航自动注册（Week 2-3）

#### A2.1 后端改造

**修改 `PageConfigService.writeBatch()`**：

```java
// PageConfigService.java — writeBatch 增加导航钩子

@Transactional
public Map<String, Object> writeBatch(String tenantId, String projectId, 
                                       String pageId, Map<String, String> files) {
    // ... 现有文件写入逻辑 ...

    // ── 新增：导航自动注册 ──
    String navPatch = files.get("navigation-patch.json");
    if (navPatch != null) {
        try {
            applyNavigationPatch(tenantId, projectId, navPatch);
        } catch (Exception e) {
            log.warn("Navigation auto-register failed for page {}: {}", pageId, e.getMessage());
            // 非阻断：导航注册失败不影响页面配置保存
        }
    }

    // ── 新增：SSE 广播导航更新事件 ──
    sseService.emit("navigation-updated", Map.of(
        "pageId", pageId,
        "timestamp", System.currentTimeMillis()
    ));

    return result;
}

private void applyNavigationPatch(String tenantId, String projectId, String navPatchJson) {
    var patch = objectMapper.readValue(navPatchJson, NavigationPatch.class);
    var node = patch.getNode();
    
    // 父节点不存在时自动创建
    if (patch.isCreateParentIfMissing()) {
        try {
            navigationService.addNode(tenantId, projectId, "root", 
                patch.getParentDefaults(), null);
        } catch (Exception ignored) {
            // 已存在则跳过
        }
    }
    
    // 注册页面节点（幂等：已存在则跳过）
    try {
        navigationService.addNode(tenantId, projectId, 
            node.getOrDefault("parentId", "root").toString(), node, null);
    } catch (Exception ignored) {
        // 节点 ID 已存在，跳过
    }
}
```

**新增 DTO**：`NavigationPatch.java`

```java
public class NavigationPatch {
    private Map<String, Object> node;
    private boolean createParentIfMissing;
    private Map<String, Object> parentDefaults;
    // getters/setters
}
```

**修改 `SseService`**：新增 `navigation-updated` 事件类型（无代码改动，现有 `emit(type, payload)` 已支持任意事件名）。

**扩展 `ALLOWED_FILES`**：

```java
// PageConfigService.java
private static final Set<String> ALLOWED_FILES = Set.of(
    "rule.json", "pagedata.json", "script.js", "style.css",
    "navigation-patch.json"  // 新增
);
```

#### A2.2 AI 生成导航补丁

**修改 `AiPageService`**：在 Phase-2 完成后自动生成 navigation-patch.json

```java
private Map<String, String> generateNavigationPatch(AiChatRequest request, 
                                                      Map<String, String> files) {
    String pageId = request.getPageId();
    String explanation = files.getOrDefault("explanation", "");
    
    // 从 rule.json 提取页面标题（第一个有 title 的组件）
    String title = extractPageTitle(files.get("rule.json"), pageId);
    
    Map<String, Object> navPatch = Map.of(
        "node", Map.of(
            "id", pageId,
            "type", "item",
            "title", title,
            "path", "/" + pageId,
            "pageId", pageId,
            "pageType", "config",
            "nodeKind", "page",
            "icon", "Document"
        ),
        "createParentIfMissing", false
    );
    
    files.put("navigation-patch.json", objectMapper.writeValueAsString(navPatch));
    return files;
}
```

#### A2.3 前端监听导航更新

**修改 `PageConfigLoader`（或 SSE 监听层）**：

```typescript
// 监听 navigation-updated 事件 → 刷新导航树
eventSource.addEventListener('navigation-updated', (event) => {
  const { pageId } = JSON.parse(event.data)
  // 触发导航树重新加载
  navigationStore.refresh()
})
```

---

### A3. 配置验证器（Week 3-4）

#### A3.1 后端验证服务

**新增 Java 文件**：`ConfigValidatorService.java`

```java
@Service
public class ConfigValidatorService {

    public record ValidationResult(
        boolean passed,
        List<ValidationIssue> errors,
        List<ValidationIssue> warnings
    ) {}

    public record ValidationIssue(
        String type,          // "datakey-missing" | "handler-missing" | ...
        String file,          // 出错文件
        String detail,        // 人类可读描述
        String suggestion     // 修复建议
    ) {}

    /**
     * 验证一个页面的 4 个配置文件一致性
     */
    public ValidationResult validate(String tenantId, String projectId, String pageId) {
        Map<String, String> files = loadAllFiles(tenantId, projectId, pageId);
        List<ValidationIssue> errors = new ArrayList<>();
        List<ValidationIssue> warnings = new ArrayList<>();

        // 1. DataKey 一致性
        checkDataKeyConsistency(files, errors);
        
        // 2. 事件处理函数存在性
        checkHandlerExistence(files, errors);
        
        // 3. Render* 函数存在性
        checkRenderFunctions(files, errors);
        
        // 4. DataRelation 完整性
        checkRelationIntegrity(files, errors);
        
        // 5. 主键定义检查
        checkPrimaryKeys(files, warnings);
        
        // 6. CSS scope 检查
        checkCssScope(files, pageId, warnings);

        return new ValidationResult(errors.isEmpty(), errors, warnings);
    }

    private void checkDataKeyConsistency(Map<String, String> files, List<ValidationIssue> errors) {
        // 从 rule.json 提取所有 dataKey 引用
        // 从 pagedata.json 提取所有表名
        // 交叉验证：dataKey 中引用的表必须在 pagedata.json 中存在
        Set<String> referencedTables = extractDataKeyTables(files.get("rule.json"));
        Set<String> definedTables = extractDefinedTables(files.get("pagedata.json"));
        
        for (String table : referencedTables) {
            if (!definedTables.contains(table)) {
                errors.add(new ValidationIssue(
                    "datakey-missing",
                    "rule.json",
                    "dataKey 引用的表 '" + table + "' 在 pagedata.json 中不存在",
                    "在 pagedata.json 的 tables 中添加 '" + table + "' 的定义"
                ));
            }
        }
    }
    
    // ... 其他检查方法类似模式 ...
}
```

#### A3.2 验证 API 端点

**新增 Controller 方法**（加入 `PageConfigController`）：

```java
@GetMapping("/pages-config/{pageId}/__validate")
public ResponseEntity<Map<String, Object>> validatePage(
        @PathVariable String pageId,
        @RequestHeader("X-Tenant-Id") String tenantId,
        @RequestHeader("X-Project-Id") String projectId) {
    var result = configValidatorService.validate(tenantId, projectId, pageId);
    return ResponseEntity.ok(Map.of(
        "passed", result.passed(),
        "errors", result.errors(),
        "warnings", result.warnings()
    ));
}
```

#### A3.3 AI 生成后自动验证

**修改 `AiPageService.processRequest()`**：在文件保存后调用验证，结果注入 response

```java
// processRequest() 末尾
var validation = configValidatorService.validate(
    request.getTenantId(), request.getProjectId(), request.getPageId());
if (!validation.passed()) {
    response.setValidationErrors(validation.errors());
    // 若有严重错误且尚有迭代余量，自动触发修复迭代
    if (round < MAX_ITERATIONS) {
        var fixRequest = buildFixRequest(request, validation);
        return processRequest(fixRequest); // 递归修复
    }
}
```

#### A3.4 前端验证结果展示

**AiChatPanel/AiDesignStudio 扩展**：

```typescript
// 生成完成后显示验证结果
if (response.validationErrors?.length > 0) {
  addMessage({
    role: 'system',
    content: `⚠️ 配置验证发现 ${response.validationErrors.length} 个问题：\n` +
      response.validationErrors.map(e => `- ${e.detail}`).join('\n')
  })
}
```

---

### Phase-A 渐进式切入点

| 用户行为 | Phase-A 前 | Phase-A 后 |
|---------|-----------|-----------|
| AI 生成页面 | 4 个文件写入 | 4 文件 + navigation-patch + 自动验证 |
| 页面访问 | 需手动配路由/导航 | AI 自动注册，菜单即时可见 |
| 生成出错 | 靠日志自迭代 | 结构化验证 + 精准修复提示 |
| Prompt 维护 | 单文件 800 行 | 分层文件，各司其职 |

---

## Phase-B：蓝图 + 数据层（6 周）

### B1. 应用蓝图（Week 1-2）

#### B1.1 DB Entity

```java
@Entity
@Table(name = "app_blueprint", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"tenant_id", "project_id"})
})
public class BlueprintEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(name = "project_id", nullable = false)
    private String projectId;

    @Lob
    @Column(name = "blueprint_json", nullable = false)
    private String blueprintJson;   // app-blueprint.json 完整内容

    @Column(name = "version", length = 20)
    private String version;         // "1.0.0"

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @PrePersist
    void onCreate() { createdAt = updatedAt = Instant.now(); }

    @PreUpdate
    void onUpdate() { updatedAt = Instant.now(); }
}
```

**Repository**：

```java
public interface BlueprintRepository extends JpaRepository<BlueprintEntity, Long> {
    Optional<BlueprintEntity> findByTenantIdAndProjectId(String tenantId, String projectId);
    boolean existsByTenantIdAndProjectId(String tenantId, String projectId);
}
```

#### B1.2 蓝图 REST API

```java
@RestController
@RequestMapping("/api/blueprint")
public class BlueprintController {

    @GetMapping
    public ResponseEntity<?> getBlueprint(
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Project-Id") String projectId) {
        // 返回当前蓝图 JSON 或 404
    }

    @PutMapping
    public ResponseEntity<?> saveBlueprint(
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Project-Id") String projectId,
            @RequestBody String blueprintJson) {
        // 创建或更新蓝图（upsert by tenant+project）
    }

    @PostMapping("/generate")
    public ResponseEntity<?> generateBlueprint(
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Project-Id") String projectId,
            @RequestBody Map<String, String> request) {
        // AI 根据自然语言需求生成蓝图
        // request.prompt = "我需要一个客户管理系统"
    }
}
```

#### B1.3 蓝图生成 Prompt（layer-1-blueprint.txt）

```text
# Layer 1：应用蓝图生成规范

你正在为 SPARK 配置平台生成**应用蓝图**（app-blueprint.json），用于规划一个业务应用的模块结构。

## 输出格式

```json
{
  "files": {
    "app-blueprint.json": "{ ... 蓝图 JSON 字符串 ... }"
  },
  "explanation": "对蓝图规划的中文说明"
}
```

## app-blueprint.json 结构规范

```json
{
  "appName": "应用名称（中文）",
  "description": "应用描述（一句话）",
  "modules": [
    {
      "id": "模块ID（kebab-case，如 customer-mgmt）",
      "name": "模块中文名",
      "description": "模块功能描述",
      "pages": [
        {
          "pageId": "页面ID（kebab-case）",
          "title": "页面中文标题",
          "type": "list | master-detail | tree-table | form | dashboard | wizard",
          "entities": ["实体名1", "实体名2"],
          "features": ["search", "crud", "export", "import", "tree", "tabs"],
          "parentPage": null
        }
      ]
    }
  ],
  "sharedEntities": ["所有模块共享的实体（如 User, Department, Dictionary）"],
  "roles": ["admin", "角色2", "viewer"],
  "navigationStructure": "sidebar-header"
}
```

## 生成原则

1. **模块划分**：按业务领域聚合，每个模块 2-5 个页面
2. **页面类型推断**：
   - 有主表+明细子表 → `master-detail`
   - 纯列表 CRUD → `list`
   - 有树形分类 → `tree-table`
   - 单记录编辑 → `form`
   - 统计汇总 → `dashboard`
3. **实体识别**：从需求中提取业务实体及其关系
4. **角色推断**：至少包含 admin（管理员）和 viewer（只读），根据业务补充中间角色
5. **parentPage**：子页面（如详情页）的 parentPage 指向列表页
6. **features 推断**：
   - 列表页默认：`["search", "crud"]`
   - 有导入导出需求：加 `"import"`, `"export"`
   - 有树形结构：加 `"tree"`
```

#### B1.4 蓝图 UI 展示与手动编辑

**新增前端组件**：`BlueprintEditor.vue`

```
┌──────────────────────────────────────────────────────┐
│ 📋 应用蓝图：客户管理系统              [AI 生成] [保存]│
├──────────────────────────────────────────────────────┤
│ ┌─────────────┐  ┌──────────────────────────────────┐│
│ │ 模块列表     │  │ 模块详情                          ││
│ │             │  │                                  ││
│ │ ► 客户管理 ◄ │  │ 模块：客户管理                     ││
│ │   订单管理   │  │ 页面：                            ││
│ │   报表中心   │  │ ┌────────────────────────────┐   ││
│ │             │  │ │ ☐ customer-list (列表)       │   ││
│ │ [+ 新增模块] │  │ │   类型: master-detail       │   ││
│ │             │  │ │   实体: Customer, Contact    │   ││
│ │             │  │ │   功能: search, crud, export │   ││
│ │             │  │ ├────────────────────────────┤   ││
│ │             │  │ │ ☐ customer-detail (详情)     │   ││
│ │             │  │ │   类型: form                 │   ││
│ │             │  │ │   实体: Customer, Contact    │   ││
│ │             │  │ │   父页面: customer-list      │   ││
│ │             │  │ └────────────────────────────┘   ││
│ │             │  │ [+ 新增页面]                      ││
│ │             │  │                                  ││
│ │             │  │ 角色：admin, sales, viewer        ││
│ └─────────────┘  └──────────────────────────────────┘│
│                                                      │
│ ┌──────────────────────────────────────────────────┐ │
│ │ JSON 源码编辑（可折叠）                            │ │
│ │ { "appName": "客户管理系统", ... }                 │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ [一键生成全部页面]  [生成选中模块]  [导出 JSON]        │
└──────────────────────────────────────────────────────┘
```

**交互流程**：
1. 用户输入需求 → AI 生成蓝图 → 展示可视化编辑器
2. 用户可手动调整模块/页面/角色
3. 也可直接编辑 JSON 源码
4. 确认后点"一键生成"→ 调度 Phase-C 多页面编排

---

### B2. DB Schema 生成（Week 3-4）

#### B2.1 文件存储

```
data/pages-config/{tenantId}/{projectId}/__shared/{moduleId}/db-schema.json
```

#### B2.2 共享配置 REST API

```java
@RestController
@RequestMapping("/api/shared-config")
public class SharedConfigController {

    @GetMapping("/{moduleId}/{configType}")
    public ResponseEntity<?> getSharedConfig(
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Project-Id") String projectId,
            @PathVariable String moduleId,
            @PathVariable String configType) {
        // configType: "db-schema" | "api-config" | "permission-config" | "dictionaries"
        // 从文件系统读取 __shared/{moduleId}/{configType}.json
    }

    @PutMapping("/{moduleId}/{configType}")
    public ResponseEntity<?> saveSharedConfig(
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Project-Id") String projectId,
            @PathVariable String moduleId,
            @PathVariable String configType,
            @RequestBody String content) {
        // 写入文件系统 + SSE 广播
    }
}
```

#### B2.3 Schema 生成 Prompt（layer-2-data-model.txt）

```text
# Layer 2：数据模型生成规范

你正在为 SPARK 配置平台生成**数据库 Schema**（db-schema.json）和对应的 **pagedata.json**。

## 输入上下文

你会收到以下信息：
- `app-blueprint.json`（蓝图，包含 entities 列表）
- 目标模块 ID 和页面列表

## 输出格式

```json
{
  "files": {
    "db-schema.json": "{ ... Schema JSON ... }",
    "pagedata.json": "{ ... 对应的 DataSet 配置 ... }"
  },
  "explanation": "数据模型设计说明"
}
```

## db-schema.json 结构规范

```json
{
  "entities": {
    "EntityName": {
      "tableName": "t_entity_name",
      "description": "实体中文描述",
      "columns": [
        {
          "name": "字段名（camelCase）",
          "dbColumn": "数据库列名（snake_case）",
          "type": "string | number | boolean | datetime | text",
          "label": "中文标签",
          "isPrimaryKey": false,
          "autoIncrement": false,
          "required": false,
          "maxLength": null,
          "defaultValue": null,
          "dict": null,
          "mask": null,
          "computeExpression": null
        }
      ],
      "indexes": [
        { "name": "idx_xxx", "columns": ["col1"], "unique": false }
      ]
    }
  },
  "tableRelations": [
    {
      "type": "one-to-many | many-to-many",
      "parent": "ParentEntity",
      "child": "ChildEntity",
      "foreignKey": "parent_id",
      "cascadeDelete": false
    }
  ],
  "dictionaries": {
    "字典键": [
      { "value": "A", "label": "标签A", "color": "#409eff" }
    ]
  }
}
```

## 生成原则

1. **命名约定**：
   - 实体名：PascalCase（如 `Customer`）
   - 字段名：camelCase（如 `customerName`）
   - 数据库表名：`t_` 前缀 + snake_case（如 `t_customer`）
   - 数据库列名：snake_case（如 `customer_name`）
2. **必备字段**：每个实体必须有 `id`（主键 + 自增）
3. **时间戳**：自动添加 `createTime` + `updateTime`
4. **关系推断**：一对多用外键，多对多额外生成中间表
5. **字典识别**：枚举型字段（如状态、等级、类型）自动生成字典
6. **敏感字段**：phone → mask:"phone"，email → mask:"email"，idCard → mask:"idcard"
7. **pagedata.json 映射**：
   - Entity → DataSet table
   - columns → DataTable columns（保留 label/type/isPrimaryKey）
   - relations → DataRelation（parentField=id, childField=foreignKey）
   - 计算列：有业务含义的派生字段自动推断 computeExpression
```

#### B2.4 Schema → pagedata.json 自动转换

**新增后端服务**：`SchemaTransformerService.java`

```java
@Service
public class SchemaTransformerService {
    
    /**
     * 将 db-schema.json 转换为 pagedata.json
     * 用于蓝图自动生成流程 + 手动编辑 schema 后的同步
     */
    public String transformToPageData(String schemaJson, String pageId, 
                                       List<String> tableNames) {
        var schema = parseSchema(schemaJson);
        var pageData = new LinkedHashMap<String, Object>();
        pageData.put("dataSetName", pageId + "DS");
        
        // 1. 表映射
        var tables = new LinkedHashMap<String, Object>();
        for (String tableName : tableNames) {
            var entity = schema.entities.get(tableName);
            if (entity == null) continue;
            tables.put(tableName, buildTableConfig(entity));
        }
        pageData.put("tables", tables);
        
        // 2. 关系映射
        var relations = schema.relations.stream()
            .filter(r -> tableNames.contains(r.parent) && tableNames.contains(r.child))
            .map(this::buildRelation)
            .toList();
        if (!tableRelations.isEmpty()) pageData.put("tableRelations", relations);
        
        return objectMapper.writerWithDefaultPrettyPrinter()
            .writeValueAsString(pageData);
    }
}
```

#### B2.5 Schema UI 编辑器

```
┌─────────────────────────────────────────────────────────┐
│ 📊 数据模型：客户管理模块              [AI 生成] [保存]  │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────┐  ┌─────────────────────────────────────┐│
│ │ 实体列表     │  │ 实体详情：Customer                   ││
│ │             │  │                                     ││
│ │ ► Customer  │  │ 物理表名：t_customer                  ││
│ │   Contact   │  │                                     ││
│ │   Order     │  │ ┌─────┬─────────┬──────┬─────┬────┐ ││
│ │   OrderItem │  │ │字段名│ 类型     │标签  │必填 │主键│ ││
│ │             │  │ ├─────┼─────────┼──────┼─────┼────┤ ││
│ │ 关系：       │  │ │ id  │ number  │ID    │ ✓   │ ✓  │ ││
│ │ Customer    │  │ │name │ string  │客户名│ ✓   │    │ ││
│ │  └→ Contact │  │ │phone│ string  │电话  │     │    │ ││
│ │  └→ Order   │  │ │level│ string  │等级  │     │    │ ││
│ │ Order       │  │ └─────┴─────────┴──────┴─────┴────┘ ││
│ │  └→ OrderItem│ │ [+ 新增字段]                          ││
│ │             │  │                                     ││
│ │ 字典：       │  │ 关系：                                ││
│ │ customer_   │  │ ├── Contact (1:N, FK: customer_id)  ││
│ │  level      │  │ └── Order   (1:N, FK: customer_id)  ││
│ └─────────────┘  └─────────────────────────────────────┘│
│                                                         │
│ [同步到 pagedata.json]  [导出 SQL DDL]  [JSON 源码]      │
└─────────────────────────────────────────────────────────┘
```

---

### B3. 页面模板库（Week 4-5）

#### B3.1 模板存储

```
spark-ai-server/data/templates/
├── list-page.template.json
├── master-detail.template.json
├── tree-table.template.json
├── form-page.template.json
├── dashboard.template.json
└── wizard.template.json
```

#### B3.2 模板结构规范

```json
{
  "templateId": "master-detail",
  "name": "主从表",
  "description": "左侧主表 + 右侧明细表，主表选中行驱动明细表数据",
  "icon": "Grid",
  "tags": ["表格", "主从", "级联"],
  "variables": {
    "masterTable": { "type": "string", "label": "主表名", "required": true },
    "detailTable": { "type": "string", "label": "明细表名", "required": true },
    "masterColumns": { "type": "columns", "label": "主表列", "source": "masterTable" },
    "detailColumns": { "type": "columns", "label": "明细表列", "source": "detailTable" },
    "pageTitle": { "type": "string", "label": "页面标题", "default": "主从表页面" }
  },
  "ruleTemplate": "... Mustache 模板字符串，渲染为 rule.json ...",
  "pagedataTemplate": "... Mustache 模板字符串，渲染为 pagedata.json ...",
  "scriptTemplate": "... Mustache 模板字符串，渲染为 script.js ...",
  "styleTemplate": "... Mustache 模板字符串，渲染为 style.css ..."
}
```

#### B3.3 模板在 AI 流程中的作用

**Prompt 注入**（当蓝图中页面 type 匹配时）：

```java
// AiPageService.buildPhase1Message() 增强
if (request.getTemplate() != null) {
    String templateContent = templateService.getTemplate(request.getTemplate());
    userMessage += "\n\n## 参考模板\n" + templateContent + 
                   "\n\n请基于此模板结构生成，根据实际需求调整内容。";
}
```

#### B3.4 模板选择 UI

```
┌────────────────────────────────────────────┐
│ 选择页面模板                      [跳过]    │
├────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│ │ 📋 列表  │ │ 📊 主从表│ │ 🌳 树表  │    │
│ │          │ │ ★ 推荐   │ │          │    │
│ │ 单表CRUD │ │ 主+明细  │ │ 左树右表 │    │
│ └──────────┘ └──────────┘ └──────────┘    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│ │ 📝 表单  │ │ 📈 看板  │ │ 🧭 向导  │    │
│ │          │ │          │ │          │    │
│ │ 分组编辑 │ │ 卡片+图表│ │ 分步提交 │    │
│ └──────────┘ └──────────┘ └──────────┘    │
│                                            │
│ AI 推荐：基于蓝图中 type="master-detail"    │
│ ★ 主从表模板最匹配当前页面                  │
└────────────────────────────────────────────┘
```

---

### B4. API 配置生成（Week 5-6）

#### B4.1 API Config 存储

```
data/pages-config/{tenantId}/{projectId}/__shared/{moduleId}/api-config.json
```

#### B4.2 API 生成 Prompt（layer-3-api.txt）

```text
# Layer 3：API 配置生成规范

你正在为 SPARK 配置平台生成 **API 端点配置**（api-config.json）。

## 输入上下文

你会收到：
- `db-schema.json`（数据模型）
- 目标实体列表

## 输出格式

```json
{
  "files": {
    "api-config.json": "{ ... API 配置 JSON ... }"
  },
  "explanation": "API 配置说明"
}
```

## api-config.json 结构规范

```json
{
  "endpoints": {
    "EntityName": {
      "baseUrl": "/api/entity-names",
      "operations": {
        "list":   { "method": "GET",    "url": "/api/entity-names" },
        "create": { "method": "POST",   "url": "/api/entity-names" },
        "update": { "method": "PUT",    "url": "/api/entity-names/{id}" },
        "delete": { "method": "DELETE", "url": "/api/entity-names/{id}" },
        "detail": { "method": "GET",    "url": "/api/entity-names/{id}" }
      },
      "pagination": {
        "type": "offset",
        "pageField": "page",
        "sizeField": "size",
        "totalField": "total",
        "dataField": "data.records"
      },
      "fieldMapping": {
        "frontendField": "backendField"
      }
    }
  },
  "globalConfig": {
    "baseUrl": "/api",
    "timeout": 10000,
    "headers": { "Content-Type": "application/json" }
  }
}
```

## 生成原则

1. **RESTful 约定**：
   - URL 使用 kebab-case 复数形式：`/api/order-items`
   - CRUD 动词映射：GET(list/detail) / POST(create) / PUT(update) / DELETE(delete)
2. **字段映射**：camelCase（前端）↔ snake_case（后端）自动推断
3. **分页策略**：默认 offset 分页，字段名遵循主流框架约定
4. **级联端点**：子实体的 list 端点自动带父 ID 参数
   ```json
   "Contact": {
     "operations": {
       "list": { "method": "GET", "url": "/api/contacts", "params": { "customerId": "{parentRow.id}" } }
     }
   }
   ```
5. **特殊操作**：有 import/export feature 的实体自动生成对应端点
```

---

### Phase-B 渐进式切入点

| 切入场景 | 触发方式 | 效果 |
|---------|---------|------|
| 用户说"做一个XX系统" | AI 自动识别 → 走蓝图流程 | 生成蓝图 → 展示编辑器 → 确认后批量生成 |
| 用户手动创建蓝图 | 蓝图编辑器 → 填写模块/页面 | 保存蓝图 → 后续按模块生成 |
| 单页面补蓝图 | 已有页面 → "整合成系统" | 反向推断蓝图 → 补充 schema/nav |
| 选模板创建 | 模板库 → 选"主从表" → 填参数 | 模板+AI 混合生成，结构有保障 |

---

## Phase-C：多页面编排（6 周）

### C1. 多页面批量生成（Week 1-3）

#### C1.1 模块生成服务

**新增 Java 文件**：`AiModuleService.java`

```java
@Service
public class AiModuleService {

    /**
     * 从蓝图生成整个模块的所有页面
     * 流程：schema → api-config → [page × N] → permission → navigation
     */
    public ModuleGenerationResult generateModule(
            String tenantId, String projectId, 
            String moduleId, String blueprintJson) {
        
        var blueprint = parseBlueprint(blueprintJson);
        var module = findModule(blueprint, moduleId);
        var result = new ModuleGenerationResult();
        
        // Step 1: 生成共享配置 (db-schema + api-config)
        var schemaResult = generateSchema(tenantId, projectId, module);
        saveSharedConfig(tenantId, projectId, moduleId, "db-schema.json", schemaResult);
        result.addStep("db-schema", StepStatus.SUCCESS);
        
        var apiResult = generateApiConfig(tenantId, projectId, module, schemaResult);
        saveSharedConfig(tenantId, projectId, moduleId, "api-config.json", apiResult);
        result.addStep("api-config", StepStatus.SUCCESS);
        
        // Step 2: 逐页面生成（按依赖顺序：父页面先于子页面）
        var sortedPages = topologicalSort(module.getPages());
        for (var page : sortedPages) {
            try {
                var pageResult = generatePage(tenantId, projectId, page, schemaResult, apiResult);
                savePage(tenantId, projectId, page.getPageId(), pageResult);
                result.addStep(page.getPageId(), StepStatus.SUCCESS);
                
                // SSE 实时推送进度
                sseService.emit("module-progress", Map.of(
                    "moduleId", moduleId,
                    "pageId", page.getPageId(),
                    "status", "completed",
                    "progress", result.getCompletedCount() + "/" + sortedPages.size()
                ));
            } catch (Exception e) {
                result.addStep(page.getPageId(), StepStatus.FAILED, e.getMessage());
            }
        }
        
        // Step 3: 批量注册导航
        registerModuleNavigation(tenantId, projectId, module, blueprint);
        result.addStep("navigation", StepStatus.SUCCESS);
        
        return result;
    }
}
```

#### C1.2 模块生成 API

```java
@PostMapping("/api/ai/module/generate")
public SseEmitter generateModule(
        @RequestHeader("X-Tenant-Id") String tenantId,
        @RequestHeader("X-Project-Id") String projectId,
        @RequestBody ModuleGenerateRequest request) {
    // request: { moduleId, blueprintJson? (可选，默认从 DB 读) }
    // 返回 SSE 流：逐步推送各页面生成进度
}
```

#### C1.3 模块生成 UI

```
┌─────────────────────────────────────────────────────────┐
│ 🚀 模块生成：客户管理                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 📊 生成进度                                              │
│                                                         │
│ ✅ db-schema.json .......... 已完成                      │
│ ✅ api-config.json ......... 已完成                      │
│ ✅ customer-list ........... 已完成 (rule.json + 3 文件) │
│ 🔄 customer-detail ........ 生成中... Phase-2            │
│ ⬜ customer-form ........... 等待中                      │
│ ⬜ permission-config ....... 等待中                      │
│ ⬜ navigation .............. 等待中                      │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 💬 AI 说明                                          │ │
│ │ 正在生成客户详情页，包含 Customer + Contact + Order  │ │
│ │ 三个标签页的只读展示...                              │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ 已完成 2/5 页面                    [暂停] [跳过当前] [取消]│
└─────────────────────────────────────────────────────────┘
```

---

### C2. 权限配置生成（Week 3-4）

#### C2.1 权限 Prompt（layer-6-permission.txt）

本阶段只负责生成模块级 `permission-config` 工件，不在本文件重复定义权限模型、字段语义或默认值。

具体权限语义、默认值与主键契约统一以 [PERMISSION_SYSTEM.md](PERMISSION_SYSTEM.md) 为准。

`layer-6-permission.txt` 只需要满足两点：

1. 生成可持久化、可审查的模块级 `permission-config` 文件。
2. 其输出字段和说明必须与 [PERMISSION_SYSTEM.md](PERMISSION_SYSTEM.md) 保持一致，禁止在 Prompt 内维护第二套权限规则。

#### C2.2 权限 UI 编辑器

```
┌──────────────────────────────────────────────────────────┐
│ 🔐 权限配置：客户管理模块           [AI 生成] [保存]      │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ 实体：[Customer ▼]                                       │
│                                                          │
│ ┌──────────────┬──────────┬──────────┬──────────┐       │
│ │  操作 / 角色  │  admin   │  sales   │  viewer  │       │
│ ├──────────────┼──────────┼──────────┼──────────┤       │
│ │ 新增          │   ✅     │   ✅     │   ❌     │       │
│ │ 导入          │   ✅     │   ❌     │   ❌     │       │
│ │ 导出          │   ✅     │   ✅     │   ❌     │       │
│ │ 删除          │   ✅     │   ❌     │   ❌     │       │
│ ├──────────────┼──────────┼──────────┼──────────┤       │
│ │ 可编辑字段    │   全部   │ name,    │   无     │       │
│ │              │          │ phone,   │          │       │
│ │              │          │ email    │          │       │
│ ├──────────────┼──────────┼──────────┼──────────┤       │
│ │ 隐藏字段      │   无     │internal  │internal  │       │
│ │              │          │Note      │Note,     │       │
│ │              │          │          │profit    │       │
│ ├──────────────┼──────────┼──────────┼──────────┤       │
│ │ 脱敏字段      │   无     │ phone    │ phone,   │       │
│ │              │          │          │ email    │       │
│ ├──────────────┼──────────┼──────────┼──────────┤       │
│ │ 行级过滤      │   无     │ ownerId  │   无     │       │
│ │              │          │= 当前用户│          │       │
│ └──────────────┴──────────┴──────────┴──────────┘       │
│                                                          │
│ [JSON 源码]  [预览效果（模拟角色切换）]                     │
└──────────────────────────────────────────────────────────┘
```

---

### C3. 声明式交互（Week 4-6）

#### C3.1 interactions.json 运行时解析

**新增前端模块**（建议归入 `packages/spark-component/src/page/interactionEngine.ts`）：

```typescript
interface InteractionRule {
  trigger: 'rowClick' | 'selectionChange' | 'fieldChange' | 'formSubmit' | 'buttonClick'
  condition?: string          // JS 表达式（沙箱内求值）
  actions: InteractionAction[]
}

interface InteractionAction {
  type: 'navigate' | 'showMessage' | 'showConfirm' | 'showDialog' |
        'enable' | 'disable' | 'show' | 'hide' |
        'refreshData' | 'setValue' | 'apiCall' | 'exportData'
  [key: string]: unknown      // 各 action 特有参数
}

/**
 * 解析 interactions.json 并绑定到组件事件
 * 历史上计划在 bindRules 阶段调用；当前现行实现应接入 SparkPageRenderer / 渲染器事件归一化路径
 */
export function applyInteractions(
  rules: Rule[],
  interactions: InteractionRule[],
  context: { dataSet: IDataSet; pageService: IPageServiceCapability }
): void {
  for (const interaction of interactions) {
    const targets = findTargetRules(rules, interaction.trigger)
    for (const target of targets) {
      bindInteractionEvent(target, interaction, context)
    }
  }
}
```

#### C3.2 声明式交互在 Prompt 中的位置

**interactions.json 不需要独立 Prompt Layer**——它是 rule.json 的配项扩展，由 Phase-1 的 layer-4-ui.txt 覆盖：

```text
# 追加到 layer-4-ui.txt 末尾

## 声明式交互（可选，减少 script.js 代码量）

在 rule.json 的组件中，可通过 `interactions` 属性声明交互逻辑：

```json
{
  "type": "r-table",
  "dataKey": "Orders@rows",
  "props": { "highlightCurrentRow": true },
  "interactions": [
    {
      "trigger": "rowClick",
      "actions": [
        { "type": "navigate", "target": "/order-detail", "params": { "id": "{row.id}" } }
      ]
    }
  ]
}
```

**使用原则**：
- 简单联动（导航、消息、显隐）优先用 interactions 声明
- 复杂逻辑（条件分支、多步骤、API 调用链）仍写 script.js
```

---

### Phase-C 渐进式切入点

| 切入场景 | 触发方式 | 效果 |
|---------|---------|------|
| 蓝图确认后 | 点"一键生成全部页面" | 进入模块编排流程，逐页面 SSE 推进度 |
| 单页面加权限 | "给这页面加权限控制" | 仅生成 permission-config，注入已有页面 |
| interactions 替代 script | AI 判断交互足够简单 | 自动用 interactions 替代 script.js 事件 |

---

## Phase-D：版本 + 变更（6 周）

### D1. 版本管理（Week 1-2）

#### D1.1 DB Entity

```java
@Entity
@Table(name = "config_version")
public class VersionEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(name = "project_id", nullable = false)
    private String projectId;

    @Column(name = "version", nullable = false, length = 20)
    private String version;

    @Column(name = "changelog", length = 2000)
    private String changelog;

    @Column(name = "change_request_id", length = 50)
    private String changeRequestId;    // 触发此版本的变更请求（可选）

    @Lob
    @Column(name = "manifest_json")
    private String manifestJson;       // 版本清单 JSON

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "published_by", length = 100)
    private String publishedBy;
}
```

#### D1.2 版本 REST API

```java
@RestController
@RequestMapping("/api/versions")
public class VersionController {

    @GetMapping
    public List<VersionSummary> listVersions(
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Project-Id") String projectId) {
        // 返回版本列表（id, version, changelog, publishedAt）
    }

    @PostMapping("/publish")
    public VersionEntity publishVersion(
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Project-Id") String projectId,
            @RequestBody VersionPublishRequest request) {
        // 1. 验证配置完整性（调用 ConfigValidatorService）
        // 2. 创建文件快照（__versions/vX.Y.Z/snapshot/）
        // 3. 计算文件 hash → 生成 manifest
        // 4. 写入 VersionEntity
        // 5. SSE 广播 version-published
    }

    @PostMapping("/rollback/{version}")
    public void rollbackToVersion(
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Project-Id") String projectId,
            @PathVariable String version) {
        // 1. 从 __versions/{version}/snapshot/ 读取快照
        // 2. 覆盖当前 pages-config 文件
        // 3. SSE 广播全量刷新
    }

    @GetMapping("/{version}/diff")
    public VersionDiff diffVersions(
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Project-Id") String projectId,
            @PathVariable String version,
            @RequestParam(defaultValue = "current") String compareTo) {
        // 返回两个版本之间的文件差异
    }
}
```

#### D1.3 版本管理 UI

```
┌──────────────────────────────────────────────────────────┐
│ 📦 版本管理                        [发布新版本]           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ v1.3.0  2026-03-16 14:30              [查看] [回滚]  │ │
│ │ 📝 订单增加折扣字段 (CR-20260316-001)                 │ │
│ │ 变更：order-list, customer-detail, permission-config │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │ v1.2.0  2026-03-15 10:00              [查看] [回滚]  │ │
│ │ 📝 新增客户管理模块（3 个页面）                       │ │
│ │ 新增：customer-list, customer-detail, customer-form  │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │ v1.1.0  2026-03-14 16:00              [查看] [回滚]  │ │
│ │ 📝 初始版本                                          │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ 版本对比：[v1.2.0 ▼] vs [v1.3.0 ▼]   [对比]            │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ order-list/pagedata.json                             │ │
│ │ - columns: [...]                                     │ │
│ │ + columns: [..., { "name": "discount", "type": ... }]│ │
│ │                                                      │ │
│ │ order-list/rule.json                                 │ │
│ │ + { "type": "el-table-column", "props": { "prop":   │ │
│ │     "discount", "label": "折扣率" } }                │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

### D2. 需求变更分析（Week 3-4）

#### D2.1 DB Entity

```java
@Entity
@Table(name = "change_request")
public class ChangeRequestEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(name = "project_id", nullable = false)
    private String projectId;

    @Column(name = "request_id", nullable = false, unique = true, length = 50)
    private String requestId;          // "CR-20260316-001"

    @Column(name = "description", length = 2000)
    private String description;        // 用户自然语言变更描述

    @Lob
    @Column(name = "analysis_json")
    private String analysisJson;       // AI 分析结果（change-request.json 格式）

    @Lob
    @Column(name = "blueprint_patch_json")
    private String blueprintPatchJson; // 增量蓝图补丁

    @Column(name = "status", length = 20, nullable = false)
    private String status;             // analyzing | confirmed | executing | completed | failed | rolled-back

    @Column(name = "base_version", length = 20)
    private String baseVersion;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @PrePersist
    void onCreate() { createdAt = Instant.now(); status = "analyzing"; }
}

@Entity
@Table(name = "change_unit")
public class ChangeUnitEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "change_request_id", nullable = false)
    private ChangeRequestEntity changeRequest;

    @Column(name = "unit_id", nullable = false, length = 20)
    private String unitId;             // "CU-1"

    @Column(name = "summary", length = 500)
    private String summary;

    @Column(name = "execution_order")
    private int executionOrder;        // DAG 拓扑排序后的位置

    @Column(name = "status", length = 20, nullable = false)
    private String status;             // pending | running | success | failed | rolled-back

    @Lob
    @Column(name = "affected_files_json")
    private String affectedFilesJson;  // 受影响文件列表 JSON

    @Column(name = "error_message", length = 2000)
    private String errorMessage;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;
}
```

#### D2.2 变更分析 Prompt（layer-8-change-analysis.txt）

```text
# Layer 8：变更分析规范

你正在分析一个 SPARK 配置平台的**需求变更请求**。

## 输入上下文

你会收到：
- **变更描述**：用户的自然语言需求变更
- **当前蓝图**：app-blueprint.json
- **受影响页面的当前配置**：rule.json / pagedata.json / script.js 等

## 输出格式

```json
{
  "files": {
    "change-request.json": "{ ... 变更分析 JSON ... }"
  },
  "explanation": "变更影响分析说明"
}
```

## change-request.json 结构规范

```json
{
  "requestId": "CR-{日期}-{序号}",
  "description": "原始变更描述",
  "analyzedAt": "ISO 时间",
  "changeUnits": [
    {
      "id": "CU-{序号}",
      "summary": "变更单元中文描述",
      "scope": "single-page | cross-page | shared-config",
      "affectedStages": ["② 数据模型", "④ UI"],
      "affectedFiles": [
        {
          "pageId": "页面ID 或 null",
          "type": "page | shared",
          "file": "文件名",
          "action": "create | modify | delete",
          "reason": "变更原因"
        }
      ],
      "risk": "low | medium | high",
      "dependencies": ["CU-X"]
    }
  ],
  "impactSummary": {
    "totalFiles": 7,
    "pagesAffected": ["page1", "page2"],
    "sharedConfigsAffected": ["db-schema.json"],
    "maxRisk": "medium",
    "estimatedStages": ["②", "④", "⑥"]
  }
}
```

## 分析原则

1. **变更拆解**：每个独立的功能变更 = 一个 changeUnit
2. **依赖识别**：数据模型变更必须在 UI 变更之前
3. **风险评估**：
   - low：仅 UI 调整（样式/标签/列顺序）
   - medium：涉及数据模型变更或跨页面联动
   - high：涉及蓝图重构或大量页面影响
4. **最小变更原则**：只列出需要修改的文件，不涉及无关文件
5. **精确定位**：每个 affectedFile 必须说明具体修改原因
6. **scope 判断**：
   - single-page：仅影响一个页面的文件
   - cross-page：影响多个页面
   - shared-config：影响共享配置文件
```

#### D2.3 变更 REST API

```java
@RestController
@RequestMapping("/api/changes")
public class ChangeController {

    @PostMapping("/analyze")
    public ResponseEntity<?> analyzeChange(
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Project-Id") String projectId,
            @RequestBody ChangeAnalyzeRequest request) {
        // 1. 创建 ChangeRequestEntity (status=analyzing)
        // 2. 加载当前蓝图 + 受影响文件
        // 3. 调用 AI (layer-8) 生成 change-request.json
        // 4. 保存 analysisJson
        // 5. 创建 ChangeUnitEntity × N
        // 6. 返回分析结果
    }

    @PostMapping("/{requestId}/confirm")
    public ResponseEntity<?> confirmChange(
            @PathVariable String requestId,
            @RequestBody ChangeConfirmRequest request) {
        // request.excludedUnits = ["CU-3"] (用户可排除部分变更单元)
        // 更新 status = confirmed
    }

    @PostMapping("/{requestId}/execute")
    public SseEmitter executeChange(
            @PathVariable String requestId,
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Project-Id") String projectId) {
        // 1. 创建变更前备份 (__changes/{requestId}/pre-snapshot/)
        // 2. 按 executionOrder 逐 CU 执行
        // 3. 每个 CU：AI 生成修改 → 写入 → 验证 → 更新状态
        // 4. 失败时自动回滚该 CU
        // 5. SSE 推送每步进度
        // 6. 全部完成 → 回归验证 → 可选自动发布新版本
    }

    @PostMapping("/{requestId}/rollback")
    public ResponseEntity<?> rollbackChange(
            @PathVariable String requestId,
            @RequestParam(required = false) String unitId) {
        // unitId 为空 → 回滚整个变更请求
        // unitId 不为空 → 仅回滚指定 CU
    }

    @GetMapping
    public List<ChangeRequestSummary> listChanges(
            @RequestHeader("X-Tenant-Id") String tenantId,
            @RequestHeader("X-Project-Id") String projectId) {
        // 变更请求历史列表
    }
}
```

#### D2.4 变更分析 UI

```
┌──────────────────────────────────────────────────────────┐
│ 🔄 需求变更                                              │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ 📝 变更描述：                                             │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 订单表增加折扣字段，列表和详情都要显示，               │ │
│ │ sales 角色对折扣字段只读                              │ │
│ └──────────────────────────────────────────────────────┘ │
│                                              [分析影响]  │
│                                                          │
│ ── 影响分析结果 ──────────────────────────────────────── │
│                                                          │
│ 📊 影响概要：7 个文件 | 3 个页面 | 风险：中               │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ ☑ CU-1：订单数据模型 + API（中风险）                  │ │
│ │   📁 __shared/order-mgmt/db-schema.json    修改      │ │
│ │   📁 __shared/order-mgmt/api-config.json   修改      │ │
│ │                                                      │ │
│ │ ☑ CU-2：订单列表 UI 更新（低风险）                    │ │
│ │   📁 order-list/pagedata.json              修改      │ │
│ │   📁 order-list/rule.json                  修改      │ │
│ │                                                      │ │
│ │ ☑ CU-3：客户详情子表更新（低风险）                    │ │
│ │   📁 customer-detail/pagedata.json         修改      │ │
│ │   📁 customer-detail/rule.json             修改      │ │
│ │                                                      │ │
│ │ ☑ CU-4：权限调整（低风险）  [依赖: CU-1]             │ │
│ │   📁 __shared/order-mgmt/permission-config 修改      │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ 执行顺序：CU-1 → CU-2 → CU-3 → CU-4                   │
│                                                          │
│ [取消] [排除选中 CU]               [确认并执行变更]      │
└──────────────────────────────────────────────────────────┘
```

---

### D3. 变更执行引擎（Week 5-6）

#### D3.1 执行流程

```java
@Service
public class ChangeExecutionService {

    public void executeChangeRequest(String requestId, SseEmitter emitter) {
        var cr = changeRequestRepository.findByRequestId(requestId)
            .orElseThrow();
        var units = changeUnitRepository.findByChangeRequestOrderByExecutionOrder(cr);
        
        // Step 1: 变更前备份
        createPreSnapshot(cr);
        emitProgress(emitter, "backup", "completed", "变更前备份已创建");
        
        // Step 2: 逐 CU 执行
        for (var unit : units) {
            if ("excluded".equals(unit.getStatus())) continue;
            
            unit.setStatus("running");
            unit.setStartedAt(Instant.now());
            changeUnitRepository.save(unit);
            emitProgress(emitter, unit.getUnitId(), "running", unit.getSummary());
            
            try {
                // AI 生成修改（注入受影响文件当前内容作为上下文）
                var modifications = generateModifications(cr, unit);
                
                // 写入文件
                applyModifications(cr.getTenantId(), cr.getProjectId(), modifications);
                
                // 验证这步修改的正确性
                var validation = validateAffectedFiles(cr, unit);
                if (!validation.passed()) {
                    throw new ValidationException(validation.errors().toString());
                }
                
                unit.setStatus("success");
                unit.setCompletedAt(Instant.now());
                emitProgress(emitter, unit.getUnitId(), "success", "完成");
                
            } catch (Exception e) {
                unit.setStatus("failed");
                unit.setErrorMessage(e.getMessage());
                emitProgress(emitter, unit.getUnitId(), "failed", e.getMessage());
                
                // 回滚此 CU
                rollbackUnit(cr, unit);
                unit.setStatus("rolled-back");
                emitProgress(emitter, unit.getUnitId(), "rolled-back", "已回滚");
                
                // 决策：继续执行后续无依赖的 CU，还是全部停止
                // 默认策略：停止后续依赖此 CU 的单元，继续无依赖的
                markDependentsAsSkipped(units, unit);
            }
            changeUnitRepository.save(unit);
        }
        
        // Step 3: 回归验证
        var allPassed = units.stream().allMatch(u -> "success".equals(u.getStatus()));
        if (allPassed) {
            cr.setStatus("completed");
            cr.setCompletedAt(Instant.now());
            emitProgress(emitter, "regression", "success", "所有变更已通过验证");
        } else {
            cr.setStatus("partial");
            emitProgress(emitter, "regression", "partial", "部分变更未完成");
        }
        changeRequestRepository.save(cr);
    }
}
```

#### D3.2 变更执行 UI

```
┌──────────────────────────────────────────────────────────┐
│ ⚡ 执行变更 CR-20260316-001                              │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ✅ 变更前备份 ................. 已完成                    │
│ ✅ CU-1: 数据模型+API ........ 已完成 (2 文件)           │
│ 🔄 CU-2: 订单列表 UI ......... 执行中 (Phase-2)         │
│ ⬜ CU-3: 客户详情子表 ......... 等待中                    │
│ ⬜ CU-4: 权限调整 ............. 等待中 (依赖 CU-1 ✅)    │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 💬 CU-2 执行详情                                     │ │
│ │ 正在修改 order-list/pagedata.json:                   │ │
│ │   + columns 新增 discount (number, "折扣率")          │ │
│ │   + computeExpression: "price * qty * (1-discount)"  │ │
│ │ 正在修改 order-list/rule.json:                       │ │
│ │   + el-table-column: prop="discount" label="折扣率"  │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ 进度：1/4 完成                  [暂停执行] [全部回滚]     │
└──────────────────────────────────────────────────────────┘
```

---

### Phase-D 渐进式切入点

| 切入场景 | 触发方式 | 效果 |
|---------|---------|------|
| 手动发布版本 | 版本管理页 → "发布新版本" | 验证 → 快照 → 记录 → 可回滚 |
| 用户说"改一下XX" | AI 识别为变更 → 走变更分析 | 自动拆解 → 影响评估 → 确认后执行 |
| 版本回滚 | 版本列表 → "回滚到 vX.Y.Z" | 一键恢复到历史快照 |
| 查看变更历史 | 变更列表 → 查看详情 | 回溯每次变更的影响范围和执行结果 |

---

## 附录 A：AI 入口路由决策树

```
用户输入
  │
  ├─ 含"做一个XX系统/平台/应用" ──→ scope=blueprint → Phase-B 蓝图流程
  │                                   └→ 无蓝图时引导创建
  │
  ├─ 含"生成XX模块所有页面" ──→ scope=module → Phase-C 模块编排
  │                               └→ 需已有蓝图
  │
  ├─ 含"修改/增加/删除/调整" + 涉及多页面 ──→ scope=change → Phase-D 变更流程
  │   例："订单加折扣字段，列表和详情都要"
  │
  ├─ 含"修改/调整" + 单页面 ──→ scope=page, action=iterate → 现有迭代
  │   例："客户列表加导出按钮"
  │
  ├─ 含"做一个XX页面" ──→ scope=page, action=generate → 现有生成
  │   例："帮我做个客户列表页"            └→ 自动检测是否有蓝图，有则注入上下文
  │
  ├─ 含"发布/上线" ──→ 版本发布流程 → Phase-D 版本管理
  │
  ├─ 含"回滚" ──→ 版本回滚流程 → Phase-D 版本管理
  │
  └─ 其他 ──→ 通用 AI 对话（AiStreamService）
```

**实现位置**：在 `AiChatController.chat()` 入口增加 scope 路由逻辑：

```java
@PostMapping("/chat")
public ResponseEntity<?> chat(@RequestBody AiChatRequest request) {
    String scope = request.getScope();
    if (scope == null) {
        scope = inferScope(request.getPrompt()); // AI 或规则推断
    }
    
    return switch (scope) {
        case "blueprint" -> blueprintController.generateBlueprint(...);
        case "module"    -> moduleService.generateModule(...);
        case "change"    -> changeService.analyzeChange(...);
        case "page"      -> aiPageService.processRequest(request);
        default          -> aiPageService.processRequest(request);
    };
}
```

---

## 附录 B：Prompt Layer 文件完整清单

| 文件名 | 实施阶段 | 注入时机 | 大小估计 |
|--------|---------|---------|---------|
| `layer-0-base.txt` | Phase-A | 始终注入 | ~200 行 |
| `layer-4-ui.txt` | Phase-A | scope=page, phase=1 | ~300 行 |
| `layer-4-data.txt` | Phase-A | scope=page, phase=2 | ~250 行 |
| `layer-1-blueprint.txt` | Phase-B | scope=blueprint | ~150 行 |
| `layer-2-data-model.txt` | Phase-B | scope=module/data-model | ~200 行 |
| `layer-3-api.txt` | Phase-B | scope=module/api | ~150 行 |
| `layer-5-behavior.txt` | Phase-C | scope=module (Phase-2) | ~100 行 |
| `layer-6-permission.txt` | Phase-C | scope=module/permission | ~150 行 |
| `layer-7-validation.txt` | Phase-A | AI 自迭代修复时注入 | ~80 行 |
| `layer-8-change-analysis.txt` | Phase-D | scope=change | ~200 行 |

---

## 附录 C：DB 迁移计划

| Entity | 表名 | Phase | 备注 |
|--------|------|-------|------|
| `BlueprintEntity` | `app_blueprint` | Phase-B | tenant+project 唯一 |
| `VersionEntity` | `config_version` | Phase-D | 版本快照元数据 |
| `ChangeRequestEntity` | `change_request` | Phase-D | 变更请求 |
| `ChangeUnitEntity` | `change_unit` | Phase-D | 变更执行单元 |

> H2 使用 `ddl-auto: update`，新增 Entity 自动建表，**无需手动 DDL 迁移**。

---

## 附录 D：前端新增组件清单

| 组件 | Phase | 位置 | 功能 |
|------|-------|------|------|
| `BlueprintEditor.vue` | B | `src/features/ai/` | 蓝图可视化编辑+JSON源码 |
| `SchemaEditor.vue` | B | `src/features/ai/` | 数据模型可视化编辑 |
| `TemplateSelector.vue` | B | `src/features/ai/` | 模板选择卡片网格 |
| `PermissionEditor.vue` | C | `src/features/ai/` | 权限矩阵交叉表编辑 |
| `ModuleProgress.vue` | C | `src/features/ai/` | 模块批量生成进度条 |
| `VersionList.vue` | D | `src/features/ai/` | 版本列表+diff对比 |
| `ChangeAnalysis.vue` | D | `src/features/ai/` | 变更影响分析展示 |
| `ChangeExecution.vue` | D | `src/features/ai/` | 变更执行进度实时展示 |

---

## 附录 E：渐进式总览——用户旅程

```
Day 1 — 用户："帮我做个客户列表页"
  → Phase-A 能力：AI 生成 4 文件 + 自动验证 + 自动挂导航
  → 页面即刻可用 ✅

Week 1 — 用户："再做个订单管理，还有报表"
  → Phase-A 能力：逐页面 AI 生成，每页自动挂导航
  → 3 个独立页面 ✅

Week 2 — 用户："把这些整合成一个系统"
  → Phase-B 能力：AI 反向推断蓝图 + 生成 Schema + 补全导航结构
  → 从独立页面升级为有结构的应用 ✅

Week 3 — 用户："加一个供应商管理模块"
  → Phase-C 能力：蓝图扩展 → 模块批量生成 → 自动导航注册
  → 一键生成整模块（3-5 页面）✅

Week 4 — 用户："订单表加个折扣字段，sales 角色只读"
  → Phase-D 能力：变更分析 → 影响评估 → 确认后自动执行 → 回归验证
  → 跨页面安全变更 ✅

Week 5 — 用户："发布 v1.0 版本"
  → Phase-D 能力：全量验证 → 创建快照 → 版本记录
  → 可回滚的版本管理 ✅
```
