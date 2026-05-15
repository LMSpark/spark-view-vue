# 元数据动态表 API 示例

Swagger 文档入口：

- JSON：`http://localhost:8080/api/openapi.json`
- UI：`http://localhost:8080/api/swagger-ui`

下面示例默认：

```bash
BASE=http://localhost:8080/api
TENANT=lmspark
PROJECT=default
TOKEN=<your-jwt-token>
AUTH="Authorization: Bearer $TOKEN"
```

## 1. 创建动态表

创建一张 `Orders` 逻辑表。物理表名由后端生成，元数据记录逻辑名、物理名、字段、视图配置和 DDL hash。

```bash
curl -X POST "$BASE/tenants/$TENANT/projects/$PROJECT/data-model/tables" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "tableName": "Orders",
    "resourceType": "database-table",
    "businessCategory": "master",
    "columns": [
      { "name": "name", "type": "string", "required": true, "maxLength": 255 },
      { "name": "status", "type": "string", "required": true, "maxLength": 64 },
      { "name": "amount", "type": "decimal", "numericPrecision": 18, "numericScale": 2 },
      { "name": "parentId", "type": "number" }
    ],
    "views": {
      "default": {
        "page": 1,
        "pageSize": 20,
        "sortExpression": [{ "field": "amount", "direction": "desc" }],
        "treeConfig": {
          "idField": "id",
          "parentIdField": "parentId",
          "textField": "name",
          "treeMode": "flat",
          "filterMode": "include-ancestors"
        },
        "aggregates": {
          "totalAmount": { "type": "sum", "field": "amount" }
        }
      }
    }
  }'
```

## 2. 新增记录

```bash
curl -X POST "$BASE/tenants/$TENANT/projects/$PROJECT/data/Orders/records" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Order A", "status": "open", "amount": 128.50, "parentId": null }'
```

创建子节点记录：

```bash
curl -X POST "$BASE/tenants/$TENANT/projects/$PROJECT/data/Orders/records" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Order A-1", "status": "open", "amount": 28.50, "parentId": 1 }'
```

## 3. DataView 查询

支持过滤、分页、排序、搜索、树配置和聚合：

```bash
curl -X POST "$BASE/tenants/$TENANT/projects/$PROJECT/data/Orders/query" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "viewId": "default",
    "query": {
      "page": 1,
      "pageSize": 10,
      "sort": "amount:desc",
      "filter": {
        "type": "and",
        "children": [
          { "field": "status", "op": "==", "value": "open" },
          { "field": "amount", "op": ">=", "value": 10 }
        ]
      },
      "search": "Order",
      "treeMode": "flat"
    },
    "viewConfig": {
      "treeConfig": {
        "idField": "id",
        "parentIdField": "parentId",
        "textField": "name",
        "treeMode": "flat"
      },
      "aggregates": {
        "totalAmount": { "type": "sum", "field": "amount" }
      }
    }
  }'
```

## 4. 树接口

加载根节点：

```bash
curl -X POST "$BASE/tenants/$TENANT/projects/$PROJECT/data/Orders/tree/children" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{ "parentId": null, "limit": 50 }'
```

加载 nested 树：

```bash
curl -X POST "$BASE/tenants/$TENANT/projects/$PROJECT/data/Orders/tree/nested" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "rootId": null,
    "depthLimit": 3,
    "viewConfig": {
      "treeConfig": {
        "idField": "id",
        "parentIdField": "parentId",
        "textField": "name",
        "treeMode": "nested"
      }
    }
  }'
```

## 5. 多表异步更新

提交 job 后，通过 SSE 监听 `data-batch-job` 和 `data-change`：

```bash
curl -X POST "$BASE/tenants/$TENANT/projects/$PROJECT/data/batch-jobs" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "demo-001",
    "operations": [
      {
        "operationId": "create-order",
        "tableName": "Orders",
        "op": "create",
        "data": { "name": "Order B", "status": "open", "amount": 80 }
      },
      {
        "operationId": "update-order",
        "tableName": "Orders",
        "op": "update",
        "pk": { "id": 1 },
        "data": { "status": "closed" }
      }
    ]
  }'
```

SSE 地址：`GET /api/events`。

## 6. 导入已有物理表

已有表导入后进入强制接管模式。若缺少 `TENANT_ID`、`PROJECT_ID`，导入时会补列并把历史数据归属当前 tenant/project；若缺少主键，会补 `ID`。

先查看可导入物理表：

```bash
curl "$BASE/tenants/$TENANT/projects/$PROJECT/data-model/introspection/tables" \
  -H "$AUTH"
```

导入 `LEGACY_ITEM`：

```bash
curl -X POST "$BASE/tenants/$TENANT/projects/$PROJECT/data-model/import-existing-tables" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "tables": [
      {
        "physicalTableName": "LEGACY_ITEM",
        "logicalTableName": "LegacyItem",
        "views": {
          "default": {
            "page": 1,
            "pageSize": 20,
            "sortExpression": [{ "field": "name", "direction": "asc" }]
          }
        }
      }
    ]
  }'
```

导入后用统一 CRUD 查询：

```bash
curl -X POST "$BASE/tenants/$TENANT/projects/$PROJECT/data/LegacyItem/query" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{ "query": { "page": 1, "pageSize": 20, "filter": { "name": "legacy" } } }'
```

## 7. 前端 DataView 接入

```ts
import { SparkData } from '@spark-view/spark-data'

const pagedata = {
  dataSetName: 'Demo',
  tables: {
    Orders: {
      tableName: 'Orders',
      resourceType: 'database-table',
      resourceId: 'Orders',
      columns: [
        { name: 'id', type: 'number', primaryKey: true },
        { name: 'name', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'amount', type: 'number' },
        { name: 'parentId', type: 'number' },
      ],
      api: SparkData.createDatabaseCrudApi('Orders'),
      views: {
        default: {
          autoLoad: true,
          page: 1,
          pageSize: 20,
          treeConfig: {
            idField: 'id',
            parentIdField: 'parentId',
            textField: 'name',
            treeMode: 'flat',
          },
          aggregates: {
            totalAmount: { type: 'sum', field: 'amount' },
          },
        },
      },
    },
  },
}

const ds = SparkData.createDataSet(pagedata)
```

SSE 监听：

```ts
import { onDataBatchJob, onDataChange } from '@/services/sse-events'

onDataBatchJob((event) => {
  console.log(event.jobId, event.status, event.completed, event.total)
})

onDataChange((event) => {
  if (event.tableName === 'Orders') {
    // 刷新相关 DataView
  }
})
```
