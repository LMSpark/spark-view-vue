# Dynamic Data Diagnostics Research

## Task

修复 IDE 诊断清理后暴露出的 `DynamicDataServiceTest` 真实失败，范围集中在动态数据服务、元数据 schema 和运行时字段映射。

## Confirmed Findings

- 附件中的 `SseService cannot be resolved` / `DataIsolationMode cannot be resolved` 来自 IDE/JDT 增量诊断或旧 `target/test-classes` 字节码，不是当前主源码事实。
- `spark-ai-server/src/main/java/com/spark/ai/service/SseService.java` 和 `spark-ai-server/src/main/java/com/spark/ai/service/DataIsolationMode.java` 都存在于 `com.spark.ai.service` 包。
- `mvn -q -DskipTests compile` 在 `spark-ai-server/` 下通过。
- 首次 `mvn -q -Dtest=DynamicDataServiceTest test` 命中了旧测试字节码，抛出 `Unresolved compilation problem`。
- `mvn -q clean -Dtest=DynamicDataServiceTest test` 后 missing type 错误消失，转为真实测试失败。

## Involved Files

- `spark-ai-server/src/main/java/com/spark/ai/service/DynamicDataModelService.java`
  - 创建/补齐动态数据元数据表。
  - 创建动态物理表、接管已有物理表。
  - 通过 JDBC introspection 回写 `DATA_MODEL_COLUMN`。
- `spark-ai-server/src/main/java/com/spark/ai/service/DynamicDataService.java`
  - 动态 CRUD、查询、过滤、排序、批处理和事务执行。
  - 当前运行时字段映射使用 `ColumnInfo.columnName()`，返回 row key 也使用 `columnName()`。
- `spark-ai-server/src/main/java/com/spark/ai/crud/FilterExpressionSqlBuilder.java`
  - 根据字段白名单编译过滤和排序表达式；字段不存在会抛 `过滤条件引用了不存在的字段`。
- `spark-ai-server/src/main/java/com/spark/ai/service/DataSourceDatabaseService.java`
  - 创建/更新数据源数据库，依赖 `DATA_SOURCE_DATABASE.CONNECTION_MODE` 和 `JNDI_NAME`。
- `spark-ai-server/src/main/java/com/spark/ai/service/DbmsCatalogService.java`
  - 同步 DBMS 物理目录，刻意按物理列名暴露目录对象列。
- `spark-ai-server/src/test/java/com/spark/ai/service/DynamicDataServiceTest.java`
  - 覆盖动态表 CRUD、隔离模式、导入已有表、事务、JTA 元数据和 SSE 事件。
- `spark-ai-server/src/test/java/com/spark/ai/service/DataSourceMetadataServiceTest.java`
  - 覆盖数据源元数据、数据库注册、DBMS 目录同步和物理列名保留。
- `spark-ai-server/src/main/resources/db/migration/V2__data_source_metadata.sql`
  - 生产迁移创建 `DATA_SOURCE_DATABASE`，当前不含后续运行态补齐的 `CONNECTION_MODE` / `JNDI_NAME`。

## Data Flow

1. `DynamicDataModelService.createTable(...)` 读取请求里的逻辑列名，如 `name` / `status` / `amount`。
2. `readColumnDrafts(...)` 默认把逻辑名转为物理名，如 `status` -> `STATUS`。
3. `createPhysicalTable(...)` 创建物理表。
4. `scanPhysicalTable(...)` 通过 JDBC metadata 读取物理列，H2 返回大写列名。
5. `replaceColumnsFromIntrospection(...)` 当前把 physical column 原样写入 `COLUMN_NAME` 和 `PHYSICAL_COLUMN_NAME`。
6. `DynamicDataService.fieldSqlMap(...)` 只按 `ColumnInfo.columnName()` 建过滤字段白名单。
7. 测试和前端调用用逻辑字段 `id/name/status/amount/orderId`，因此过滤器找不到 `status/name`，返回 row 中 `id` 也为 null。

## Constraints

- `DbmsCatalogService` 的目录同步路径有意保留物理列名，测试期望 `ID` / `NAME` 这类物理名继续存在。
- 不能全局把所有 introspection 元数据列名改为 lowerCamel，否则会误伤 DBMS 物理目录视图和相关测试。
- H2 metadata schema 中 `DATA_SOURCE_DATABASE` 的 `jodi_NAME` 是 typo，调用方实际使用 `JNDI_NAME`。
- MySQL schema 分支已有 `JNDI_NAME`，且 `ensureMySqlMetadataSchema()` 会补 `CONNECTION_MODE` / `JNDI_NAME`。

## Current Verification Baseline

- `mvn -q -DskipTests compile`: pass.
- `mvn -q clean -Dtest=DynamicDataServiceTest test`: missing type 已消失，但存在真实失败：
  - `JNDI_NAME` column not found。
  - `过滤条件引用了不存在的字段 "status"`。
  - `过滤条件引用了不存在的字段 "name"`。
  - `Map.of(...)` 因 `order.get("id")` 为 null 抛 NPE。

## Impact Surface

- 最小修复预计涉及 `DynamicDataModelService.java` 和 `DynamicDataService.java`。
- 如选择补生产迁移，可能涉及 `V2__data_source_metadata.sql` 或新增迁移文件。
- 测试层可能只需运行既有 `DynamicDataServiceTest` / `DataSourceMetadataServiceTest`，除非实现路线改变测试契约。
