# Java Diagnostics Cleanup Research

## Task

Eliminate the Java/JDT diagnostics from the attached IDE warning list. cSpell/spell-check diagnostics are explicitly out of scope for this round.

## Confirmed Scope

- In scope:
  - Java severity 8 diagnostics from the attachment.
  - Java severity 4 warnings from the attachment.
  - Source and test cleanup needed to remove unused imports, unused fields, unused private helpers, unnecessary suppressions, and generic varargs warnings.
- Out of scope:
  - cSpell diagnostics.
  - Dictionary/workspace spelling configuration.
  - Renaming SQL/database keywords or metadata literals only to satisfy spelling.

## Verification Baseline

- `java -version` reports Java 17.
- `spark-ai-server`: `mvn -q clean test-compile` passes.
- Therefore the attached `SseService cannot be resolved` and `DataIsolationMode cannot be resolved` diagnostics are not current Maven compiler facts. They are most likely stale IDE/JDT incremental diagnostics or stale build-output diagnostics.

## Severity 8 Diagnostics

- Files:
  - `spark-ai-server/src/main/java/com/spark/ai/service/DynamicDataService.java`
  - `spark-ai-server/src/test/java/com/spark/ai/service/DynamicDataServiceTest.java`
- Reported missing types:
  - `SseService`
  - `DataIsolationMode`
- Source facts:
  - `spark-ai-server/src/main/java/com/spark/ai/service/SseService.java` exists in package `com.spark.ai.service`.
  - `spark-ai-server/src/main/java/com/spark/ai/service/DataIsolationMode.java` exists in package `com.spark.ai.service`.
  - Maven `clean test-compile` passes, so no source edit is currently justified for these missing-type diagnostics.

## Java Warning Inventory

### Simple Unused Imports Or Fields

- `spark-ai-server/src/main/java/com/spark/ai/config/JwtAuthFilterConfig.java`
  - Unused import: `jakarta.servlet.FilterConfig`.
- `spark-ai-server/src/main/java/com/spark/ai/controller/AiSessionController.java`
  - Unused logger field `log`.
  - Removing it also removes now-unused SLF4J imports.
- `spark-ai-server/src/main/java/com/spark/ai/service/AiSessionService.java`
  - Unused imports: `java.io.Reader`, `java.util.Iterator`.
- `spark-ai-server/src/main/java/com/spark/ai/service/DataSourceServerService.java`
  - Unused import: `java.util.Set`.
- `spark-ai-server/src/main/java/com/spark/ai/service/FilterExpressionCaseService.java`
  - Unused import: `java.util.Objects`.
- `spark-ai-server/src/main/java/com/spark/ai/service/PageConfigService.java`
  - Unused import: `java.nio.file.Files`.

### Potential Structural Cleanup

- `spark-ai-server/src/main/java/com/spark/ai/service/DataSourceDatabaseService.java`
  - Field `primaryDataSource` is assigned in the constructor but never read in this service.
  - Constructor call sites include Spring injection and `DataSourceMetadataServiceTest`.
  - Removing the constructor parameter would ripple into tests and Spring wiring; keeping the constructor and dropping only the field is the smaller behavioral change if approved.
- `spark-ai-server/src/main/java/com/spark/ai/service/AiSessionService.java`
  - `buildWindowedMessages(Session)` delegates to `buildWindowedMessages(Session, List<Message>)` and is unused locally.
  - `Session.instanceId`, `Session.runtimeInstanceId`, and `Session.consecutiveFailures` are assigned but not read as fields.
  - `PostedTurnRecord.status` is written through `markCompleted` / `markFailed`, but not read.
  - `instanceId` and `runtimeInstanceId` are still represented in `Session.scope` via `SessionScope.toMap()`, so removing redundant fields should preserve public scope output.
  - `consecutiveFailures` currently does not affect retry, state transition, or persistence behavior.
  - `PostedTurnRecord.status` currently does not affect idempotency; idempotency uses `inputHash`.
- `spark-ai-server/src/main/java/com/spark/ai/service/DynamicDataModelService.java`
  - Local variable `result` in `createTable` is unused; the method returns `getTablePayload(...)`.
  - Overloads `ensureManagedPhysicalShape(String,String,IntrospectedTable)`, `createIndexIfMissing(String,String,List<String>)`, and `tryAlter(String)` are unused.
  - The target-JDBC overloads are used and must remain.
- `spark-ai-server/src/main/java/com/spark/ai/service/ProjectNavigationTreeService.java`
  - Private helpers `loadOrInit`, `getChildren`, and `isGroupKind` are unused.
  - One `@SuppressWarnings("unchecked")` is reported as unnecessary.
- `spark-ai-server/src/main/java/com/spark/ai/service/ProjectService.java`
  - Private recursive helper `findNodeByPath(...)` is only referenced by itself and has no external caller.
- `spark-ai-server/src/main/java/com/spark/ai/service/TenantService.java`
  - One `@SuppressWarnings("unchecked")` is reported as unnecessary.
- `spark-ai-server/src/main/java/com/spark/ai/service/WorkflowDesignService.java`
  - Private `requireObject(JsonNode,String)` only delegates to `requiredObject(...)` and has no caller.

### Test Varargs Warnings

- `spark-ai-server/src/test/java/com/spark/ai/service/ProjectNavigationTreeServiceTest.java`
  - Helper `createNavRoot(Map<String,Object>... children)` causes generic-array warnings at call sites and a heap-pollution warning at the helper.
- `spark-ai-server/src/test/java/com/spark/ai/service/ProjectServiceNavigationSeedTest.java`
  - Helpers `navRoot(Map<String,Object>... children)` and `module(String,String,Map<String,Object>... children)` cause generic-array warnings at call sites and heap-pollution warnings at helpers.
  - `childHidden(...)` is unused.

## Constraints And Impact

- Do not include cSpell in this round.
- Do not rename SQL/database metadata terms for spelling purposes.
- Do not remove dynamic-data target-JDBC helper overloads that are still used.
- The repo worktree already has many unrelated modifications; cleanup must stay scoped to approved files and avoid unrelated formatting churn.
- Because more than three files are affected and both source and test helpers are involved, the task is complex under the project workflow.

## Candidate Verification

- Baseline / source compile: `mvn -q clean test-compile` in `spark-ai-server`.
- Focused tests for changed test helpers:
  - `mvn -q -Dtest=ProjectNavigationTreeServiceTest,ProjectServiceNavigationSeedTest test`
- Broader backend check after cleanup:
  - `mvn -q test` if the user wants full backend verification and accepts the runtime cost.
