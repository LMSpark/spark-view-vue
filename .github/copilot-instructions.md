# Form Create SSR Application - AI Coding Agent Instructions

> 注意：本文件中的路径引用使用代码格式，以便 AI 助手准确理解项目结构。

## Project Overview
This is a **configuration-driven Vue 3 SSR application** with **strong kernel + low-code pages** architecture. All pages are rendered through a single `DynamicPage.vue` component using JSON configurations.

## Core Architecture Principles

### 1. Strong Kernel + Low-Code Philosophy
- **Powerful Kernel**: DynamicPage.vue + DataSetManager handle all complex logic
- **Low-Code Pages**: Page scripts focus on business logic only
- **Complete Decoupling**: UI ↔ DataSetManager ↔ Data via observer pattern
- **Zero Initialization**: Kernel auto-detects and initializes everything

### 2. Single Component Architecture
- **Only one view component**: `src/views/DynamicPage.vue`
- All routes map to this component via `meta.pageId`
- Pages differentiated by loading different JSON configs from `src/mock/pages/{pageId}/`

### 3. Page Configuration Structure
Each page requires exactly these files in `src/mock/pages/{pageId}/`:
- **`rule.json`** (required): UI structure with Element Plus components, event handlers, data bindings
- **`data.json`** (required): Page-specific data accessible via `dataKey` in rules
- **`script.js`** (optional): ES6 module in `src/pageScripts/{pageId}/script.js` exporting event handlers
- **`style.css`** (optional): Scoped CSS auto-prefixed with `[data-page="{pageId}"]`

### 4. Rule.json Schema
- Event handlers in `rule.json` reference function names as strings: `"on": { "click": "handleSubmit" }`
- Functions must be exported from `src/pageScripts/{pageId}/script.js`:
  ```javascript
  export function handleSubmit() { /* logic */ }
  ```
- Access runtime context via imports from `../common.js`:
  - `$api()` - form-create API instance
  - `$data()` - page data from data.json
  - `$dataSetManager()` - DataSetManager instance (auto-created by kernel)
  - `$route()` - current Vue route
  - `$el()` - page container element
  - `$query(selector)` / `$queryAll(selector)` - DOM query within page
  - `$rebindRules()` - manually trigger UI rebind (rarely needed)

### 7. Low-Code Pattern for DataSet Operations

**完全解耦：UI 请求不等待，数据加载完成后自动通知**

**UI 发起请求（非阻塞）**：
```javascript
export function handleRequestOrderDetails() {
  const manager = $dataSetManager();
  manager.requestTableData('OrderDetails'); // 不使用 await！
  // 函数立即返回，数据加载在后台进行
}
```

**DataSetManager 异步处理**：
```javascript
// requestTableData 返回 void，内部异步处理
requestTableData(tableName: string): void {
  this._requestTableDataAsync(tableName).catch(error => {
    this.emit('loadError', { tableName, error });
  });
}
```

**订阅机制自动通知**：
```javascript
// DynamicPage.vue 自动订阅所有表
autoSubscribeTables() {
  tableNames.forEach(tableName => {
    dataSetManager.subscribe(tableName, () => {
      rebindRules(); // 数据变化自动重绑
    });
  });
}
```

**事件监听（可选，用于显示提示）**：
```javascript
export function __init__() {
  const manager = $dataSetManager();
  
  // 注册数据加载器
  manager.dataLoader = mockDataLoader;
  
  // 监听加载成功事件
  manager.on('loadSuccess', ({ tableName }) => {
    ElMessage.success(`✅ ${tableName} 数据加载完成！`);
  });
}
```

**关键时序**：
```
1. autoSubscribeTables()      ← 先注册订阅者
2. __init__()                  ← 注册 dataLoader 和事件监听
3. 用户点击按钮
4. requestTableData()          ← 非阻塞，立即返回
5. 数据异步加载
6. notifySubscribers()         ← 通知订阅者
7. rebindRules()               ← UI 自动更新
8. emit('loadSuccess')         ← 触发事件（显示提示）
```

### 9. Critical Architecture Pattern: Complete Decoupling

**Core Principle**: UI requests and data binding are **completely decoupled** via observer pattern.

**UI Layer (script.js)**:
- Request data: `manager.requestTableData(tableName)` - **NO await**
- Function returns immediately (non-blocking)
- Never directly manipulate data or wait for loading

**DataSet Layer (DataSetManager)**:
- Async processing: `_requestTableDataAsync()` 
- Smart dependency analysis: root table detection, dependency chain
- Notify subscribers when data ready: `notifySubscribers(tableName)`
- Emit events: `loadSuccess`, `loadError` for optional UI feedback

**UI Binding Layer (DynamicPage.vue)**:
- Auto-subscribe tables: scans `dataKey` in rules
- Callback on data change: `subscribe(tableName, () => rebindRules())`
- Vue reactivity: `pageRules.value = bindDataToRules(...)`
- No manual refresh needed: form-create auto-detects changes

**Timing Sequence (CRITICAL)**:
```
1. processPageData()           - Initialize data (empty arrays)
2. initDataSetManager()        - Create manager instance
3. originalRules.value = ...   - Save rules config
4. autoSubscribeTables()       - Register subscribers (MUST be before __init__)
5. Load module
6. __init__()                  - Register dataLoader + event listeners
7. User clicks button          - Trigger requestTableData()
8. Async loading              - Manager loads data in background
9. notifySubscribers()        - Trigger callbacks
10. rebindRules()             - UI auto-updates via Vue reactivity
```

**DO NOT**:
- ❌ Use `await manager.requestTableData()` - breaks decoupling
- ❌ Call `formApi.refresh()` manually - use Vue reactivity
- ❌ Register subscribers after `__init__()` - they won't receive notifications
- ❌ Directly assign `table.rows = []` for clearing - use `splice()` for reactivity
- **Server**: `server.ts` - Express + Vite SSR middleware
- **Entry points**: 
  - Client: `src/entry-client.ts` - hydration
  - Server: `src/entry-server.ts` - render to string
- **App factory**: `src/app.ts` - creates SSR app with plugins
- **Routes**: Loaded from `src/mock/routes.json` at runtime

## Critical Workflows

### Adding a New Page
1. Add route to `src/mock/routes.json`:
   ```json
   { "path": "/newpage", "name": "newpage", "pageId": "newpage", "meta": { "title": "New Page" } }
   ```
2. Create `src/mock/pages/newpage/rule.json` and `data.json`
3. (Optional) Create `src/pageScripts/newpage/script.js` with:
   - Exported event handler functions
   - `__init__()` function for data loader registration
4. No Vue component creation needed - uses existing DynamicPage
5. **If using dataset**: Kernel auto-initializes DataSetManager, auto-subscribes tables

### Adding DataSet to a Page
1. Structure data.json with dataset format (see section 5)
2. Use `"dataKey": "dataset.tables.TableName.rows"` in rules
3. Kernel automatically:
   - Creates DataSetManager instance
   - Subscribes to all tables referenced in rules (scans dataKey)
   - Sets up cascade relationships
   - Handles data loading with dependency analysis

### Working with DataSet in Page Scripts
```javascript
import { $data, $dataSetManager } from '../common.js';
import { ElMessage } from 'element-plus';

// Mock data loader
const mockDataLoader = async (tableName) => {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 800));
  return mockData[tableName] || [];
};

// Initialize: register data loader
export function __init__() {
  const manager = $dataSetManager();
  
  // Register data loader (required for requestTableData)
  manager.dataLoader = mockDataLoader;
  
  // Optional: listen to events for UI feedback
  manager.on('loadSuccess', ({ tableName }) => {
    ElMessage.success(`✅ ${tableName} loaded!`);
  });
}

// Event handlers: non-blocking requests
export function handleLoadData() {
  const manager = $dataSetManager();
  manager.requestTableData('OrderDetails'); // NO await
  // Function returns immediately
}

// Manual data operations
export function handleAddUser() {
  const pageData = $data();
  const newUser = { id: Date.now(), name: 'New User' };
  
  pageData.dataset.tables.Users.rows.push(newUser);
  manager.notifySubscribers('Users'); // Trigger UI update
}

// Cascade operations
export function handleUpdateUser(user, newName) {
  const manager = $dataSetManager();
  const oldValues = { ...user };
  
  user.name = newName;
  manager.cascadeUpdate('Users', user, oldValues); // Auto-notifies
}

export function handleDeleteUser(user, index) {
  const manager = $dataSetManager();
  const users = $data().dataset.tables.Users.rows;
  
  manager.cascadeDelete('Users', user); // Auto-cascades to children
  users.splice(index, 1); // Use splice for reactivity
}
```

### Development Commands
- **SSR dev**: `npm run dev:ssr` (port 3000, full SSR with HMR)
- **CSR dev**: `npm run dev` (port 5173, client-only for faster iteration)
- **Build**: `npm run build:ssr` (creates dist/client + dist/server)
- **Type check**: `npm run typecheck` (strict mode - zero errors required)
- **Lint**: `npm run lint:fix` (ESLint with Vue + TypeScript rules)

### Debugging SSR Issues
- Check terminal output - server errors appear in `dev:ssr` console
- Common issue: Component not SSR-compatible (Element Plus/form-create already configured in vite.config.ts)
- Hydration mismatches: Ensure no client-only code in pageScripts during SSR

## Project-Specific Conventions

### File Naming
- Route configs: lowercase with hyphens (not camelCase)
- PageIds: match route names exactly
- Script files: `script.js` not `index.js` or other names

### Data Binding
- Use `dataKey` in rules to reference nested data: `"dataKey": "stats.totalUsers"`
- Tables require `"dataKey"` pointing to array + `"type": "el-table"` with column children
- DO NOT bind data in script.js - all data flows through rule.json
use `await` when calling `requestTableData()` - breaks decoupling
8. **DON'T** call `formApi.refresh()` manually - rely on Vue reactivity
9. **DON'T** register subscribers after `__init__()` - must be before data requests
10. **DON'T** use array indices for tables - use semantic names: `tables.Users` not `tables[0]`
11. **DON'T** forget to call `notifySubscribers()` after manual data manipulation
12. **DON'T** directly assign `table.rows = []` - use `splice()` for Vue reactivity
- Common styles in `src/style.css`
Complete Decoupling via Observer Pattern
```
UI (button click)
  ↓ requestTableData() - non-blocking
Returns immediately
  ↓
DataSetManager: async background loading
  ↓
Data ready → notifySubscribers()
  ↓ triggers callback
rebindRules() → pageRules.value = ...
  ↓ Vue reactivity
form-create detects change → auto re-render
```

**Key Points**:
- UI never waits for data loading
- Subscribers registered before any data requests
- Notifications trigger automatic UI updates
- No manual refresh needed

### Smart Dependency Loading
- **Dependency Analysis**: Kernel analyzes table relations and builds dependency tree
- **Root Detection**: Automatically finds root tables (tables with no parents)
- **Conditional Loading**: Only loads if dependencies are satisfied or loads roots first
- **Event-Driven**: Parent load notifies children, they load if subscribed
- **Example**: Request OrderDetails → Kernel loads Categories → Products → OrderDetailsse kebab-case in rule.json: `"type": "el-button"` not `"type": "ElButton"`
- Icons: Import from 'element-plus/icons-vue' if needed

### Mock API
- Mock data in `src/mock/` served by vite-plugin-mock in CSR mode
- SSR directly imports JSON files (see `src/entry-server.ts`)
- API interface: `src/api/index.ts`

## Common Mistakes to Avoid

1. **DON'T** create new Vue components in `src/views/` - extend DynamicPage.vue instead
2. **DON'T** use `window` object in pageScripts without checking `typeof window !== 'undefined'`
3. **DON'T** modify `src/app.ts` for page-specific logic - use pageScripts
4. **DON'T** use `.vue` files for pages - everything is JSON-driven
5. **DON'T** import page data directly in scripts - use `$data()` for reactivity
6. **DON'T** manually initialize DataSetManager - kernel does it automatically
7. **DON'T** manually call rebindRules after data changes - subscription handles it
8. **DON'T** use array indices for tables - use semantic names: `tables.Users` not `tables[0]`
9. **DON'T** forget to call `notifySubscribers()` after manual data manipulation
10. **DON'T** recursively load child tables - let them decide based on subscriptions

## Advanced Kernel Features
Complete Decoupling"**: UI requests don't wait, DataSetManager notifies when ready
2. **Non-Blocking First**: Never use `await` on `requestTableData()` in UI layer
3. **Subscribers Before Requests**: Auto-subscribe must happen before `__init__()` 
4. **Trust Vue Reactivity**: No manual `formApi.refresh()`, let Vue handle updates
5. **Trust the Kernel**: Don't reinitialize, don't manually bind - kernel does it automatically  
6. **Use Semantic Names**: `tables.Users` not `tables[0]` for maintainability
7. **Embrace Full Decoupling**: UI ↔ Subscription ↔ Data, never direct connections
8. **Cascade Operations**: Use `cascadeUpdate/Delete`, not manual traversal
9. **Smart Loading**: Use `requestTableData()`, kernel handles dependency chains
10. **Observer Pattern**: Data changes notify subscribers, UI updates automatically
11. **Event-Driven**: Parent notifies children, children decide autonomously
12. **__init__ for Setup**: Use `__init__()` to register dataLoader and event listeners, not for data requests
### Observer Pattern Implementation
```
UI (Rules with dataKey) 
  ↓ auto-scanned by kernel
Subscribe to Tables
  ↓ data changes
DataSetManager.notifySubscribers()
  ↓ triggers callbacks
rebindRules() → UI updates
```

### Cascade Operations Flow
```
Delete User(id=1)
  ↓ cascadeDelete()
Find Orders(userId=1) → Delete recursively
  ↓ for each Order
Find OrderItems(orderId=x) → Delete
  ↓ after all deletions
notifySubscribers('Users')
notifySubscribers('Orders')  
notifySubscribers('OrderItems')
  ↓ all subscribed UIs
Auto-update via rebindRules()
```

## Quick References

- Architecture deep-dive: `README_ARCHITECTURE.md`
- SSR documentation: `README_SSR.md`
- Example configs: 
  - Basic page: `src/mock/pages/home/`
  - DataSet with cascade: `src/mock/pages/cascade-demo/`
  - Smart dependency loading: `src/mock/pages/smart-load/`
- Type definitions: `src/types/index.ts`
- DataSet types: `src/types/pageData.ts`
- Kernel implementation: `src/utils/dataSetManager.ts`
- UI kernel: `src/views/DynamicPage.vue`

## Key Takeaways for AI Agents

1. **Think "Low-Code First"**: Page scripts should have minimal code, kernel handles complexity
2. **Trust the Kernel**: Don't reinitialize, don't manually bind - kernel does it automatically  
3. **Use Semantic Names**: `tables.Users` not `tables[0]` for maintainability
4. **Embrace Decoupling**: UI ↔ Subscription ↔ Data, never direct connections
5. **Cascade Operations**: Use `cascadeUpdate/Delete`, not manual traversal
6. **Smart Loading**: Use `requestTableData()`, kernel handles dependency chains
7. **Observer Pattern**: Data changes notify subscribers, UI updates automatically
8. **Event-Driven**: Parent notifies children, children decide autonomously
