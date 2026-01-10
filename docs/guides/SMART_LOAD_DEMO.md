# 智能依赖加载演示

## 访问地址
http://localhost:3000/smart-load

## 演示内容

### 依赖链结构
```
OrderDetails (订单明细表)
    ↓ 依赖 productId
Products (产品表)
    ↓ 依赖 categoryId  
Categories (分类表) - 根表
```

### 智能加载流程

#### 场景 1：请求 OrderDetails（完整依赖链）
1. **用户操作**：点击"📦 请求订单明细数据"
2. **内核分析**：
   - 检查 OrderDetails 是否有数据 → 无
   - 分析依赖链：OrderDetails → Products → Categories
   - 识别根表：Categories（无父依赖）
3. **自动加载顺序**：
   ```
   ① 加载 Categories（根表，800ms 延迟）
   ② 通知 Products：父表已就绪
   ③ Products 有 UI 订阅者 → 自动加载（800ms 延迟）
   ④ 通知 OrderDetails：父表已就绪
   ⑤ OrderDetails 有 UI 订阅者 → 自动加载（800ms 延迟）
   ```
4. **总耗时**：~2.4 秒（3 次网络请求）
5. **UI 更新**：每个表加载完成后自动刷新对应卡片

#### 场景 2：请求 Products（部分依赖链）
1. **用户操作**：点击"🛍️ 请求产品数据"
2. **内核分析**：
   - 检查 Products 是否有数据 → 无
   - 分析依赖：Products → Categories
   - 识别根表：Categories
3. **自动加载顺序**：
   ```
   ① 加载 Categories（800ms）
   ② 通知 Products：父表已就绪
   ③ Products 有订阅者 → 自动加载（800ms）
   ```
4. **总耗时**：~1.6 秒（2 次网络请求）

#### 场景 3：请求 Categories（无依赖）
1. **用户操作**：点击"📁 请求分类数据"
2. **内核分析**：Categories 本身就是根表，无依赖
3. **加载顺序**：
   ```
   ① 直接加载 Categories（800ms）
   ```
4. **总耗时**：~0.8 秒（1 次网络请求）

#### 场景 4：缓存利用（已有数据）
1. **前提**：已通过场景 1 加载所有数据
2. **用户操作**：再次点击"📦 请求订单明细数据"
3. **内核行为**：
   ```
   检查 OrderDetails.rows.length > 0 → 是
   直接使用缓存数据
   通知 UI 订阅者刷新
   ```
4. **总耗时**：< 10ms（无网络请求）

## 控制台日志示例

### 首次加载 OrderDetails
```
============================================================
🚀 用户请求: OrderDetails 数据
============================================================
🔍 请求表数据: OrderDetails
📦 需要先加载根依赖表: Categories
🌐 开始加载数据: Categories
🌐 模拟加载数据: Categories
✅ 数据加载成功: Categories，共 3 行
📢 通知 1 个订阅者: Categories 数据已更新
🔄 表 Categories 数据变化，自动重绑 UI
📢 通知子表 Products: 父表 Categories 数据已更新
📢 通知 Products: 依赖数据已更新，请根据需要加载
🎯 Products 有 UI 订阅者，自动加载数据
🌐 开始加载数据: Products
🌐 模拟加载数据: Products
✅ 数据加载成功: Products，共 4 行
📢 通知 1 个订阅者: Products 数据已更新
🔄 表 Products 数据变化，自动重绑 UI
📢 通知子表 OrderDetails: 父表 Products 数据已更新
📢 通知 OrderDetails: 依赖数据已更新，请根据需要加载
🎯 OrderDetails 有 UI 订阅者，自动加载数据
🌐 开始加载数据: OrderDetails
🌐 模拟加载数据: OrderDetails
✅ 数据加载成功: OrderDetails，共 4 行
📢 通知 1 个订阅者: OrderDetails 数据已更新
🔄 表 OrderDetails 数据变化，自动重绑 UI
============================================================
✅ 智能加载完成！依赖链: Categories → Products → OrderDetails
============================================================
```

## 核心架构优势

### 1. 完全解耦
- **UI 层**：通过 `dataKey` 绑定表，自动订阅数据变化
- **业务层**：只需调用 `manager.requestTableData(tableName)`
- **数据层**：DataSetManager 自动分析依赖、加载数据、通知更新

### 2. 零递归加载
- ❌ **传统方式**：父表加载后递归调用子表加载（强制）
- ✅ **事件驱动**：父表加载后**通知**子表，子表根据**是否有订阅者**自主决定加载
- **好处**：避免加载无用数据，节省网络和内存

### 3. 智能缓存
- 自动检查表是否已有数据
- 有数据直接使用，无需重复请求
- 点击"🗑️ 清空所有数据"可重置缓存

### 4. 低代码实现
页面脚本仅需：
```javascript
export async function handleRequestOrderDetails() {
  const manager = $dataSetManager();
  await manager.requestTableData('OrderDetails'); // 一行代码！
}
```

内核自动处理：
- ✅ 依赖分析（递归查找父表）
- ✅ 根表识别（找到依赖链起点）
- ✅ 按序加载（根 → 中间 → 叶子）
- ✅ 事件通知（父表 → 子表）
- ✅ UI 更新（订阅机制自动触发）

## 测试步骤

### Step 1：清空数据
1. 刷新页面（F5）
2. 点击"🗑️ 清空所有数据"
3. 确认三个表都是空的

### Step 2：完整依赖链测试
1. 打开浏览器开发者工具（F12）→ Console
2. 点击"📦 请求订单明细数据"
3. 观察控制台日志：应该看到 Categories → Products → OrderDetails 依次加载
4. 观察 UI：三个表从上到下依次出现数据

### Step 3：部分依赖链测试
1. 点击"🗑️ 清空所有数据"
2. 点击"🛍️ 请求产品数据"
3. 观察：只加载 Categories 和 Products，不加载 OrderDetails

### Step 4：无依赖测试
1. 点击"🗑️ 清空所有数据"
2. 点击"📁 请求分类数据"
3. 观察：只加载 Categories

### Step 5：缓存测试
1. 在有数据的状态下，再次点击任意按钮
2. 观察：立即显示提示，无网络延迟

## 技术细节

### 数据加载器
```javascript
const mockDataLoader = async (tableName) => {
  await new Promise(resolve => setTimeout(resolve, 800)); // 模拟网络
  return mockData[tableName] || [];
};

// 在 script.js 中注册
manager.dataLoader = mockDataLoader;
```

### 依赖配置（pagedata.json）
```json
{
  "relations": [
    {
      "parentTable": "Categories",
      "childTable": "Products",
      "dependencyType": "allRows",
      "filterExpression": {
        "field": "categoryId",
        "op": "==",
        "value": { "func": "FIELD", "args": ["id"] }
      }
    }
  ]
}
```

### UI 订阅（自动）
DynamicPage.vue 自动扫描 rule.json 中的 `dataKey`：
```json
{
  "type": "el-table",
  "dataKey": "dataset.tables.OrderDetails.rows"
}
```
→ 内核自动订阅 `OrderDetails` 表

## 预期结果
✅ 所有表数据正确显示  
✅ 依赖链按正确顺序加载  
✅ UI 自动刷新（无需手动调用 rebindRules）  
✅ 控制台日志清晰展示加载流程  
✅ 缓存机制生效（重复请求秒出）  
