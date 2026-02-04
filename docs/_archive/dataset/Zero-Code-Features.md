# 零代码架构 - 完整特性说明

## 🎯 核心设计理念

**强内核 + 低代码**：系统处理100%的状态管理，业务代码处理0-100%的业务逻辑。

## ✨ 新增零代码特性

### 1️⃣ 条件不满足时递归清空子表

**场景**：用户取消选择父表行时，子表及所有后代表自动清空。

**实现**：
```typescript
// DataSet.applyRelation
if (!parentRows || parentRows.length === 0) {
  // 清空子表
  childContext.clearAll(true);
  this.notifySubscribers(childTable, childContextId);
  
  // 🔗 递归清空孙表
  this.recursiveClearChildTables(childTable, childContextId);
}
```

**示例流程**：
```
用户取消选择省份
  ↓
Provinces.currentRow = null
  ↓
触发关系: Provinces → Cities
  ↓
条件不满足: parentRows.length === 0
  ↓
清空 Cities: rows=[], currentRow=null, selectedRows=[]
  ↓
通知订阅者: Cities UI 自动清空
  ↓
递归清空: Cities → Districts
  ↓
清空 Districts 及所有后代
```

**业务代码**：❌ 零代码！系统自动处理。

---

### 2️⃣ 自动选中第一行（autoSelectFirst）

**场景**：数据加载完成后，自动选中第一行并触发级联加载。

**配置** (pagedata.json)：
```json
{
  "dataset": {
    "tables": {
      "Provinces": {
        "tableName": "Provinces",
        "rows": [],
        "autoSelectFirst": true  // ← 加载完成后自动选中第0行
      },
      "Cities": {
        "tableName": "Cities",
        "rows": [],
        "autoSelectFirst": false  // ← 不自动选中，等待用户操作
      }
    }
  }
}
```

**实现**：
```typescript
// DataSet.loadTableData
if (table.autoSelectFirst && rows.length > 0 && !table.currentRow) {
  console.log(`🎯 自动选中第一行: ${tableName}`);
  table.setCurrentRow(rows[0], false);  // 触发级联
}
```

**示例流程**：
```
加载 Provinces 数据 → 3条记录
  ↓
autoSelectFirst: true
  ↓
自动选中: Provinces.currentRow = rows[0] ("北京")
  ↓
触发关系: Provinces → Cities (autoLoad: true)
  ↓
自动加载: requestTableData('Cities')
  ↓
加载完成: Cities 数据 → 16条记录
  ↓
autoSelectFirst: true
  ↓
自动选中: Cities.currentRow = rows[0] ("东城区")
  ↓
... 级联继续
```

**业务代码**：❌ 零代码！只需配置 `autoSelectFirst: true`。

---

### 3️⃣ BindingContext.clearAll() 方法

**用途**：清空上下文的所有状态（rows、currentRow、selectedRows）。

**特性**：
- 保留 `_originalRows` 缓存（用于后续过滤）
- 可选择是否通知订阅者
- 触发 `contextCleared` 事件

**API**：
```typescript
context.clearAll(skipNotify?: boolean): void
```

**使用场景**：
```javascript
// 1. 系统自动调用（条件不满足）
// DataSet.applyRelation 内部自动调用

// 2. 业务手动调用（重置表单）
export function handleReset() {
  const dataSet = $dataSet();
  const context = dataSet.getContext('Users', 'default');
  context.clearAll();  // 清空并通知
}
```

---

### 4️⃣ 递归通知机制

**实现**：
```typescript
private recursiveClearChildTables(parentTable: string, parentContextId: string) {
  const childRelations = this.relations.filter(
    rel => rel.parentTable === parentTable && 
           rel.parentContextId === parentContextId
  );
  
  childRelations.forEach(relation => {
    const childContext = this.getContext(relation.childTable, relation.childContextId);
    
    if (childContext.rows.length > 0) {
      // 清空子表
      childContext.clearAll(true);
      this.notifySubscribers(relation.childTable, relation.childContextId);
      
      // 递归清空孙表
      this.recursiveClearChildTables(relation.childTable, relation.childContextId);
    }
  });
}
```

**特性**：
- 深度优先遍历（DFS）
- 自动处理任意层级关系
- 每层都通知订阅者

---

## 📋 完整的零代码级联示例

### 场景：省市区街道（4层级联）

#### pagedata.json
```json
{
  "dataset": {
    "tables": {
      "Provinces": { 
        "tableName": "Provinces", 
        "rows": [], 
        "autoSelectFirst": true 
      },
      "Cities": { 
        "tableName": "Cities", 
        "rows": [], 
        "autoSelectFirst": true 
      },
      "Districts": { 
        "tableName": "Districts", 
        "rows": [], 
        "autoSelectFirst": false 
      },
      "Streets": { 
        "tableName": "Streets", 
        "rows": [], 
        "autoSelectFirst": false 
      }
    },
    "relations": [
      {
        "parentTable": "Provinces",
        "childTable": "Cities",
        "dependencyType": "currentRow",
        "autoLoad": true,
        "filterExpression": {
          "operator": "=",
          "field": "provinceId",
          "parentField": "id"
        }
      },
      {
        "parentTable": "Cities",
        "childTable": "Districts",
        "dependencyType": "currentRow",
        "autoLoad": true,
        "filterExpression": {
          "operator": "=",
          "field": "cityId",
          "parentField": "id"
        }
      },
      {
        "parentTable": "Districts",
        "childTable": "Streets",
        "dependencyType": "currentRow",
        "autoLoad": true,
        "filterExpression": {
          "operator": "=",
          "field": "districtId",
          "parentField": "id"
        }
      }
    ]
  }
}
```

#### rule.json
```json
[
  {
    "type": "el-select",
    "dataKey": "dataset.tables.Provinces.rows",
    "props": { "placeholder": "选择省份" }
  },
  {
    "type": "el-select",
    "dataKey": "dataset.tables.Cities.rows",
    "props": { "placeholder": "选择城市" }
  },
  {
    "type": "el-select",
    "dataKey": "dataset.tables.Districts.rows",
    "props": { "placeholder": "选择区县" }
  },
  {
    "type": "el-select",
    "dataKey": "dataset.tables.Streets.rows",
    "props": { "placeholder": "选择街道" }
  }
]
```

#### script.js
```javascript
export function __init__() {
  const dataSet = $dataSet()
  dataSet.dataLoader = async (tableName) => {
    return await fetch(`/api/${tableName}`).then(r => r.json())
  }
  dataSet.requestTableData('Provinces')
}

// 🎉 4层级联 + 自动选中 + 自动清空 = 0核心代码！
```

---

## 🔄 完整执行流程

### 正向加载流程（条件满足）

```
1. 加载 Provinces → 3条记录
2. autoSelectFirst: true → 自动选中"北京"
3. 触发关系: Provinces.currentRow 变化
4. 条件判断: ✅ currentRow 存在
5. autoLoad: true → 自动加载 Cities
6. 加载 Cities → 16条记录
7. autoSelectFirst: true → 自动选中"东城区"
8. 触发关系: Cities.currentRow 变化
9. 条件判断: ✅ currentRow 存在
10. autoLoad: true → 自动加载 Districts
11. 加载 Districts → 5条记录
12. autoSelectFirst: false → 等待用户操作
```

### 反向清空流程（条件不满足）

```
1. 用户重新选择省份下拉框（选择"上海"）
2. Provinces.currentRow 变化
3. 触发关系: Provinces → Cities
4. 条件判断: ✅ currentRow 存在（"上海"）
5. 清空旧数据: Cities.clearAll()
6. 递归清空: Cities → Districts
7. 清空 Districts.clearAll()
8. 递归清空: Districts → Streets
9. 清空 Streets.clearAll()
10. 加载新数据: requestTableData('Cities', { provinceId: 2 })
11. 应用过滤: Cities.rows = 新数据
12. autoSelectFirst: true → 自动选中"黄浦区"
13. ... 级联继续
```

---

## 🎯 零代码架构总结

| 特性 | 实现方式 | 业务代码 |
|------|---------|---------|
| **事件注入** | 内核自动注入 | ❌ 无需编写 |
| **状态同步** | BindingContext | ❌ 自动同步 |
| **条件判断** | DataSet.applyRelation | ❌ 自动判断 |
| **自动加载** | autoLoad + requestTableData | ❌ 配置驱动 |
| **自动选中** | autoSelectFirst | ❌ 配置属性 |
| **递归清空** | recursiveClearChildTables | ❌ 自动递归 |
| **UI更新** | 观察者通知 | ❌ 自动更新 |
| **业务逻辑** | 可选事件B | ✅ 可选增强 |

**代码量对比**：

| 层级 | 传统方式 | 零代码架构 |
|------|---------|-----------|
| 3层 | ~150行 | 1个 dataLoader (5行) |
| 5层 | ~300行 | 1个 dataLoader (5行) |
| 10层 | ~600行 | 1个 dataLoader (5行) |

**核心优势**：
- ✅ 无限层级支持
- ✅ 配置驱动一切
- ✅ 观察者自动通知
- ✅ 递归处理关系
- ✅ 业务代码可选
- ✅ 完全类型安全

---

## 📚 相关文档

- [DataKey Paths](./DataKey-Paths.md) - 数据路径语法
- [CRUD Guide](./DATASET_CRUD_GUIDE.md) - CRUD 操作指南
- [Filter Expressions](./FILTER_EXPRESSION_TESTS.md) - 过滤表达式
- [Architecture](../architecture/README_ARCHITECTURE.md) - 架构设计
