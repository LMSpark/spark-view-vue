状态：implementing

## 任务目标

消除附件中本轮纳入范围的 Java/JDT 诊断警示；cSpell/拼写检查和 DynamicData/H2 测试改造不纳入本轮。

## 影响范围

- `spark-ai-server/src/main/java/com/spark/ai/config/JwtAuthFilterConfig.java`
  - 删除未使用 import `jakarta.servlet.FilterConfig`。
- `spark-ai-server/src/main/java/com/spark/ai/controller/AiSessionController.java`
  - 删除未使用 logger 字段及随之未使用的 SLF4J imports。
- `spark-ai-server/src/main/java/com/spark/ai/service/AiSessionService.java`
  - 删除未使用 imports：`java.io.Reader`、`java.util.Iterator`。
  - 删除未使用私有重载 `buildWindowedMessages(Session)`。
  - 删除 `Session.instanceId`、`Session.runtimeInstanceId`、`Session.consecutiveFailures` 及其无读取赋值。
  - 删除 `PostedTurnRecord.status` 及 `markCompleted` / `markFailed` 对该字段的写入。
- `spark-ai-server/src/main/java/com/spark/ai/service/DataSourceDatabaseService.java`
  - 删除未使用字段 `primaryDataSource` 和构造器中的赋值，保留构造参数不改。
- `spark-ai-server/src/main/java/com/spark/ai/service/DataSourceServerService.java`
  - 删除未使用 import `java.util.Set`。
- `spark-ai-server/src/main/java/com/spark/ai/service/DynamicDataModelService.java`
  - 删除 `createTable` 中未使用局部变量。
  - 删除未使用便捷重载 `ensureManagedPhysicalShape(String,String,IntrospectedTable)`、`createIndexIfMissing(String,String,List<String>)`、`tryAlter(String)`；保留正在使用的 target-JDBC overload。
- `spark-ai-server/src/main/java/com/spark/ai/service/FilterExpressionCaseService.java`
  - 删除未使用 import `java.util.Objects`。
- `spark-ai-server/src/main/java/com/spark/ai/service/PageConfigService.java`
  - 删除未使用 import `java.nio.file.Files`。
- `spark-ai-server/src/main/java/com/spark/ai/service/ProjectNavigationTreeService.java`
  - 删除未使用私有 helpers：`loadOrInit`、`getChildren`、`isGroupKind`。
  - 只移除附件明确标出的 unnecessary `@SuppressWarnings("unchecked")`。
- `spark-ai-server/src/main/java/com/spark/ai/service/ProjectService.java`
  - 删除未使用私有递归 helper `findNodeByPath(...)`。
- `spark-ai-server/src/main/java/com/spark/ai/service/TenantService.java`
  - 只移除附件明确标出的 unnecessary `@SuppressWarnings("unchecked")`。
- `spark-ai-server/src/main/java/com/spark/ai/service/WorkflowDesignService.java`
  - 删除未使用私有 helper `requireObject(JsonNode,String)`。
- `spark-ai-server/src/test/java/com/spark/ai/service/ProjectNavigationTreeServiceTest.java`
  - 给泛型 varargs 测试 helper 增加 `@SafeVarargs` 并满足 Java 对 static/final/private helper 的要求。
- `spark-ai-server/src/test/java/com/spark/ai/service/ProjectServiceNavigationSeedTest.java`
  - 给泛型 varargs 测试 helper 增加 `@SafeVarargs`。
  - 删除未使用测试 helper `childHidden(...)`。

## 技术方案

1. 执行开工检查：确认 `git status`、当前分支、Java 17 和 `mvn -q clean test-compile` 编译基线。
2. 每次修改前重新读取对应文件当前版本。
3. 先做最小闭环 1：删除单纯 unused imports / unused logger / unused local variable，随后运行 `mvn -q clean test-compile`。
4. 最小闭环 2：删除确定无调用的私有 helper 和冗余字段，保留外部注入构造签名；随后运行 `mvn -q clean test-compile`。
5. 最小闭环 3：处理附件明确标出的 unnecessary suppressions；随后运行 `mvn -q clean test-compile`。
6. 最小闭环 4：给测试泛型 varargs helper 增加 `@SafeVarargs`，删除未使用测试 helper；随后运行相关测试。
7. 对 severity 8 missing-type 诊断不做源码改动；以 `mvn -q clean test-compile` 通过作为源码事实，最终提示刷新 IDE/Java Language Server。

关键设计决策：

- cSpell 不纳入本轮，避免把 SQL/database 专有词误改成业务代码变更。
- DynamicData/H2 真实测试失败不纳入本轮，避免警示清理和数据库策略改造混在一起。
- `DataSourceDatabaseService` 保留构造参数，减少 Spring 注入和测试实例化影响面。
- `AiSessionService` 的 `instanceId/runtimeInstanceId` 对外语义仍由 `scope` map 承担，只删除未读取冗余字段。

## 兼容性

- 对外 API、数据库 schema、SSE 事件、controller 路由不变。
- Spring bean 构造签名不变。
- 测试 helper 的结构和返回数据不变。
- 破坏性变更：无预期破坏性变更。

## 验证计划

- 编译基线：`mvn -q clean test-compile`（在 `spark-ai-server/` 下，已确认当前基线通过）。
- 修改后编译：每个最小闭环后运行 `mvn -q clean test-compile`。
- 相关测试：`mvn -q -Dtest=ProjectNavigationTreeServiceTest,ProjectServiceNavigationSeedTest test`。
- 人工验证：
  - 附件中的 Java severity 4 warning 对应代码点已被删除或最小处理。
  - 附件中的 Java severity 8 missing-type 诊断不再作为源码问题处理；如 IDE 仍显示，刷新 Java Language Server / 清理 IDE 工作区缓存。

## 风险项

- `AiSessionService` 字段虽然未读取，但历史上可能被预期用于后续调试；缓解：只删除字段层冗余，对外 `scope` map 保持不变。
- 部分 unnecessary suppression 的 IDE 判断可能与 Maven 编译器不同；缓解：仅处理附件明确列出的 suppress，不扩展扫描。
- 工作树已有大量无关修改；缓解：本轮只触碰方案列出的文件，不做格式化、重命名或计划外清理。
