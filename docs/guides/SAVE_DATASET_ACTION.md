# save-dataset 配置保存链路

`save-dataset` 是页面配置层触发 `DataSet.saveChanges()` 的声明式动作。它用于把表单编辑态、DataView staged 变更、主从表批量保存和后端统一事务提交收敛到一条配置链路中，避免页面为保存流程编写 `script.js`。

## 一句话链路

`rule.json` 的 `r-button.props.action = "save-dataset"` -> `node-to-descriptor` 解析为 `SaveDataSetAction` -> `action-executor` 分发 -> `executeSaveDataSet()` 组装 `DataSetSaveChangesOptions` -> `DataSet.saveChanges()` 应用 `editingRows` 并收集 staged 变更 -> 按 `tableRelations` 父表到子表排序 -> `perView` 逐视图 CRUD 或 `transaction` 统一 POST 到 `/data/transactions` -> 后端 `DynamicDataService.executeTransaction()` 在数据库事务中提交并用 `DATA_TRANSACTION_COMMIT` 处理幂等重放。

## 配置入口

最小按钮配置：

```json
{
  "type": "r-button",
  "id": "btn-save-dataset",
  "props": {
    "label": "保存全部",
    "template": "success",
    "action": "save-dataset",
    "mode": "transaction",
    "successMessage": "已通过统一事务提交"
  },
  "children": []
}
```

DataSet 级默认事务配置写在 `pagedata.json` 顶层：

```json
{
  "dataSetName": "TxBackendCommitPageDataSet",
  "saveChanges": {
    "mode": "transaction",
    "transaction": {
      "endpoint": {
        "url": "/data/transactions",
        "method": "POST"
      }
    }
  }
}
```

`save-dataset` 按钮可覆盖或补充 DataSet 默认配置：

| 属性 | 类型 | 含义 |
| --- | --- | --- |
| `mode` | `"perView" \| "transaction"` | 本次保存模式。未配置时使用 `pagedata.json.saveChanges.mode`，再降级为 `perView`。 |
| `requestId` | `string` | 本次事务幂等请求号。会映射为 `options.transaction.requestId`。 |
| `applyEditingRows` | `boolean` | 是否先把 DataView 编辑态应用到 staged 脏追踪。默认 `true`。 |
| `views` | `Array<{ tableName, viewId?, ids? }>` | 限定本次保存的视图和行。不配置时扫描 DataSet 内所有视图。 |
| `successMessage` / `failureMessage` / `emptyMessage` | `string` | 动作执行提示文案。 |

## 前端执行链路

1. 页面配置通过 `compileRule()` 编译成 SparkNode 树。
2. `node-to-descriptor` 读取 `r-button.props.action`。当值为 `save-dataset` 时，构造 `SaveDataSetAction`，只接受合法的 `mode`、`requestId`、`applyEditingRows`、`views`。
3. `action-executor` 在 action switch 中分发到 `executeSaveDataSet()`。
4. `executeSaveDataSet()` 通过 `ctx.getDataSet()` 取得当前页面 DataSet。DataSet 未就绪时直接提示 `DataSet 未就绪`。
5. 执行器把动作属性转成 `DataSetSaveChangesOptions`，再调用 `dataSet.saveChanges(options)`。
6. 成功时显示 `successMessage` 或 DataSet 返回的 message；失败时显示 `failureMessage` 或 DataSet 返回的 message。

对应实现入口：

- `SaveDataSetAction` 类型：[../../packages/spark-component/src/page/actions/action-types.ts](../../packages/spark-component/src/page/actions/action-types.ts)
- SparkNode 到动作描述符：[../../packages/spark-component/src/page/actions/node-to-descriptor.ts](../../packages/spark-component/src/page/actions/node-to-descriptor.ts)
- 动作分发：[../../packages/spark-component/src/page/actions/action-executor.ts](../../packages/spark-component/src/page/actions/action-executor.ts)
- 动作执行：[../../packages/spark-component/src/page/actions/action-data.ts](../../packages/spark-component/src/page/actions/action-data.ts)

## DataSet 保存链路

`DataSet.saveChanges(options)` 是真正的保存边界。

1. `resolveSaveChangesTargets()` 决定保存范围：优先使用 `options.views`，否则遍历 DataSet 内全部视图。
2. 目标视图按 `tableRelations` 做父表到子表排序；同一表内 `default` 视图优先。
3. 默认先执行 `view.applyEditingRows(ids)`，把 UI 编辑域中的 runtime patch 写回 DataView，并进入 staged 脏追踪。
4. `perView` 模式逐个调用 `view.saveChanges(ids)`，使用各表 CRUD API 提交。
5. `transaction` 模式把每个视图的 pending create/update/delete 转成统一 `operations`，然后一次调用事务端点。
6. 事务成功后根据 `operationId` 对应的服务端返回结果清理 dirty tracking，并同步 create/update 后的行数据。

事务请求体形态：

```json
{
  "requestId": "tx-config-retry-v1",
  "operations": [
    {
      "operationId": "SparkTxOrders@default:create:9001",
      "tableName": "SparkTxOrders",
      "op": "create",
      "data": {
        "id": 9001,
        "orderNo": "TX-BE-001",
        "owner": "Morgan",
        "status": "draft"
      }
    },
    {
      "operationId": "SparkTxItems@default:create:9101",
      "tableName": "SparkTxItems",
      "op": "create",
      "data": {
        "id": 9101,
        "orderId": 9001,
        "sku": "SKU-TX",
        "quantity": 1,
        "status": "draft"
      }
    }
  ]
}
```

DataSet 相关实现入口：

- 保存类型定义：[../../packages/spark-data/src/types.ts](../../packages/spark-data/src/types.ts)
- 保存编排与事务 payload：[../../packages/spark-data/src/dataset.ts](../../packages/spark-data/src/dataset.ts)
- DataView staged 保存：[../../packages/spark-data/src/data-view.ts](../../packages/spark-data/src/data-view.ts)
- 事务 HTTP 调用：[../../packages/spark-data/src/crud-service.ts](../../packages/spark-data/src/crud-service.ts)

## 后端事务链路

统一事务端点是租户/项目作用域 API：

```text
POST /api/tenants/{tenantId}/projects/{projectId}/data/transactions
```

页面配置里通常只写相对地址：

```json
{ "url": "/data/transactions", "method": "POST" }
```

前端平台作用域会把它解析为当前租户和项目下的事务 API。

后端处理流程：

1. `DynamicDataController` 接收 `/transactions` 请求并转给 `DynamicDataService.executeTransaction()`。
2. `executeTransaction()` 运行在 Spring `@Transactional` 中，任一 operation 失败会抛错并回滚整批操作。
3. 当请求包含 `requestId` 时，后端根据规范化后的 `operations` 计算 hash，并写入 `DATA_TRANSACTION_COMMIT`。
4. 相同 `requestId` + 相同 operations 再次提交时，返回已提交结果并标记 `replayed = true`。
5. 相同 `requestId` + 不同 operations 会返回冲突错误，避免误重放不同事务。
6. 数据变更事件在事务提交后再发送，避免回滚事务提前广播。

后端实现入口：

- Controller：[../../spark-ai-server/src/main/java/com/spark/ai/controller/DynamicDataController.java](../../spark-ai-server/src/main/java/com/spark/ai/controller/DynamicDataController.java)
- Service：[../../spark-ai-server/src/main/java/com/spark/ai/service/DynamicDataService.java](../../spark-ai-server/src/main/java/com/spark/ai/service/DynamicDataService.java)
- 幂等表结构：[../../spark-ai-server/src/main/java/com/spark/ai/service/DynamicDataModelService.java](../../spark-ai-server/src/main/java/com/spark/ai/service/DynamicDataModelService.java)

## 真实配置验证页

当前有三个 0 代码事务验证页，均位于 `spark-ai-server/data/pages-config/lmspark/homepage/`：

| 页面 | 验证点 |
| --- | --- |
| `tx-editing-rows` | UI 编辑态先进入 `editingRows`，再由 `save-dataset` 应用并事务提交。 |
| `tx-transaction-commit` | 主表和从表 staged create 一次统一事务提交，父表 operation 先于子表。 |
| `tx-transaction-retry` | 固定 `requestId` 重试，同 payload replay，不同 payload conflict。 |

这些页面不允许依赖 `script.js`。保存行为应由 `rule.json` 的内置动作和 `pagedata.json.saveChanges` 表达。

## 测试与验收

推荐的聚焦验证命令：

```powershell
pnpm run typecheck
pnpm exec vitest run packages/spark-data/src/tests/commit-mode.test.ts tests/transaction-config-pages.test.ts --reporter verbose
pnpm exec eslint packages/spark-component/src/page/actions/action-data.ts packages/spark-component/src/page/actions/action-executor.ts packages/spark-component/src/page/actions/action-types.ts packages/spark-component/src/page/actions/button-templates.ts packages/spark-component/src/page/actions/executor-helpers.ts packages/spark-component/src/page/actions/node-to-descriptor.ts tests/transaction-config-pages.test.ts
cd spark-ai-server
$env:MAVEN_OPTS='-Xmx512m -XX:MaxMetaspaceSize=256m -XX:ReservedCodeCacheSize=64m -XX:+UseSerialGC'
mvn -Dtest=DynamicDataServiceTest -DforkCount=0 -Dmaven.compiler.fork=false test
```

回归测试覆盖：

- 配置页不包含 `script.js`。
- `pagedata.json.saveChanges.mode` 为 `transaction`。
- 事务 endpoint 使用 `/data/transactions`，不走 `/data/batch-jobs`。
- `rule.json` 使用 `save-dataset` 内置动作。
- 主从表事务 payload 按父表到子表排序。

## 使用边界

- `save-dataset` 只负责触发 DataSet 保存，不负责创建 DataSet 或补齐缺失 API。
- `transaction` 模式必须配置 `saveChanges.transaction.endpoint` 或通过动作 options 提供 endpoint；缺失时应 fail-fast。
- `requestId` 只解决同一事务请求的幂等重放，不是业务撤销/历史版本能力。
- 主从表提交顺序依赖 `tableRelations`，字段映射仍属于 `tableRelations`，不要把字段映射放进 `viewDependencies`。
- `/data/batch-jobs` 是异步批处理与部分失败模型，不是统一事务提交入口。
