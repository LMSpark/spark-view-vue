# 字段依赖投影视图依赖机制

## 目标

字段级联不再使用动作式字段规则。新的抽象把问题拆成两层：

- `views[viewId].fieldDependencies` 描述当前编辑域内字段之间的依赖关系。
- `viewDependencies` 描述源字段或父视图如何过滤、刷新目标 DataView。

字段变化后，运行时只做一件事：更新当前编辑域字段源快照并发出字段源变化事件。目标 DataView 的 `CascadeDelegate` 订阅显式 `ViewDependency`，由统一的视图依赖链条刷新下游选项视图。业务无需写 `script.js`。

## 配置结构

字段依赖挂在编辑视图上：

```json
{
  "fieldDependencies": [
    {
      "field": "cityId",
      "dependsOn": ["countryId", "provinceId"],
      "optionDependencyId": "cities-by-region",
      "valuePolicy": "clear",
      "clearAlso": ["districtId", "cityName"],
      "lookup": {
        "viewKey": "Cities@byRegion",
        "matchField": "id",
        "map": { "cityName": "name", "cityCode": "code" }
      }
    }
  ]
}
```

选项视图过滤挂在 DataSet 的显式 `viewDependencies` 上：

```json
{
  "viewDependencies": [
    {
      "id": "cities-by-region",
      "targetViewKey": "Cities@byRegion",
      "sources": [
        {
          "id": "address",
          "type": "fields",
          "viewKey": "Address@editor",
          "scope": "editContext",
          "fields": ["countryId", "provinceId"]
        }
      ],
      "bindings": [
        { "sourceId": "address", "sourceField": "countryId", "targetField": "countryId", "required": true },
        { "sourceId": "address", "sourceField": "provinceId", "targetField": "provinceId", "required": true }
      ],
      "autoLoad": true,
      "emptyPolicy": "clearRows"
    }
  ]
}
```

## 运行规则

- 字段组件默认写回成功后调用 `DataSet.notifyFieldChanged()`；`onChange` 取消默认行为时不触发。
- `notifyFieldChanged()` 会等待字段源订阅者完成；`keepIfValid` 会在选项视图刷新后再校验当前值。
- `valuePolicy: "clear"` 会清空下游字段和 `clearAlso` 字段，并递归传播，最大深度 8。
- `optionDependencyId` 指向字段对应的选项依赖；真正刷新由目标 DataView 订阅 `ViewDependency.sources[type="fields"]` 后完成。
- 多父级通过多个 `bindings` 表达，运行时按 AND 合并过滤条件。
- `required: true` 的源值为空时，目标视图按 `emptyPolicy` 处理，默认清空 rows。
- `lookup` 只负责字段选中后从选项行回填 label/code，不负责过滤或刷新。

## AI 配置口径

- 不再生成动作式字段规则。
- 维护字段依赖使用 `list/get/add/update/removeFieldDependency`。
- 维护选项过滤链路使用 `list/get/create/update/deleteDependency`，依赖必须显式包含 `id`、`targetViewKey`、`sources`、`bindings`。
- 主从视图和字段下拉都走同一套 `ViewDependency` 运行时；`tableRelations` 只表达表间业务事实，不自动生成视图依赖。
