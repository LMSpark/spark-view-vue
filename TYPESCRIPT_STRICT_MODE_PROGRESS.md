# TypeScript 严格模式和重构进度报告

**日期**: 2026-02-02  
**目标**: 启用严格 TypeScript、遵循 SOLID 原则、确保架构依赖关系正确

## 已完成的工作 ✅

### 1. TypeScript 严格模式配置
- ✅ 所有包启用了严格类型检查：
  - `strict: true`
  - `noImplicitAny: true`
  - `strictNullChecks: true`
  - `noUncheckedIndexedAccess: true`
  - `noImplicitReturns: true`

### 2. 核心包构建成功
| 包名 | 状态 | 说明 |
|------|------|------|
| @spark-view/spark-component | ✅ 成功 | 修复了 98 个 TypeScript 错误 |
| @spark-view/spark-app | ✅ 成功 | 添加了 path 映射避免源文件冲突 |
| @spark-view/spark-data | ✅ 成功 | 无错误 |
| @spark-view/spark-page-config | ✅ 成功 | 修复了 noEmit 继承问题 |
| @spark-view/spark-renderer | ❌ 失败 | 类型错误和 .vue 模块问题 |

### 3. 关键问题修复

#### 问题 1: TypeScript 编译其他包的源文件
**现象**: spark-app 构建时尝试编译 spark-core/src 下的文件  
**原因**: pnpm workspace 链接机制 + TypeScript moduleResolution  
**解决方案**:
```json
// packages/spark-app/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@spark-view/spark-component": ["../spark-component/dist/index.d.ts"]
    }
  },
  "exclude": ["../spark-core/src"]
}
```

#### 问题 2: noEmit 继承导致不生成文件
**现象**: spark-page-config 构建成功但没有 dist 目录  
**原因**: 根 tsconfig.json 设置 `noEmit: true`，子包继承了这个设置  
**解决方案**: 子包显式设置 `noEmit: false`

#### 问题 3: Vue 内部类型暴露
**现象**: `markRaw` 返回类型包含 `RawSymbol` 导致导出错误  
**解决方案**: 为函数添加明确的返回类型注解

#### 问题 4: 未使用的导入
**现象**: 大量 TS6133 错误  
**解决方案**: 
- 删除未使用的导入
- 使用 `_` 前缀标记有意未使用的参数

### 4. 类型安全改进
- 替换了 20+ 处 `any` 类型为具体类型
- 修复了所有隐式 any 错误
- 添加了严格的 null 检查
- 修复了索引访问的安全性

## 仍需完成的工作 ⏳

### spark-renderer 的构建问题

**错误 1: DataSet 类型不匹配**
```typescript
// src/composables/usePageDataSet.ts:79
context.$dataSet = dataSet.value
// Type mismatch: missing properties like eventListeners, contextSubscribers, etc.
```
**修复建议**: 
```typescript
context.$dataSet = dataSet.value as unknown as DataSet
// 或者确保返回完整的 DataSet 类型
```

**错误 2: .vue 文件模块找不到**
```typescript
// src/index.ts:9
export { default as PageRenderer } from './components/PageRenderer.vue'
// Cannot find module './components/PageRenderer.vue'
```
**修复建议**: 添加 Vue 类型声明
```typescript
// src/shims-vue.d.ts
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, unknown>
  export default component
}
```

**错误 3: tableName 可能为 undefined**
```typescript
// src/composables/usePageDataSet.ts:118
dataSet.value!.subscribe(tableName, contextId, () => {
// Argument of type 'string | undefined' is not assignable to parameter of type 'string'
```
**修复建议**:
```typescript
if (tableName) {
  dataSet.value!.subscribe(tableName, contextId, () => {
    // ...
  })
}
```

### 主应用集成

当所有包构建成功后，需要：

1. **更新主应用依赖**
```bash
cd d:\SPARK_VIEW
pnpm install  # 重新链接 workspace 包
```

2. **验证导入**
```bash
pnpm run build  # 构建主应用
pnpm run dev    # 启动开发服务器
```

3. **测试套件**
```bash
pnpm run test  # 运行所有测试
```

## 架构依赖验证 ✅

已通过 grep 验证：
- ✅ L1 (spark-app) 不依赖 L2/L3
- ✅ L2 (spark-page-config) 不依赖 L3  
- ✅ L3 (spark-renderer) 正确依赖 L1, L2
- ✅ L4-L6 (spark-core, spark-data) 完全独立

## 技术债务和改进建议

### 短期 (本周内)
1. 修复 spark-renderer 的类型错误
2. 为所有 .vue 文件添加类型声明
3. 运行完整的测试套件
4. 更新 API 文档

### 中期 (下周)
1. 启用 `noUnusedLocals` 和 `noUnusedParameters`
2. 增加测试覆盖率到 80%+
3. 添加 CI/CD 类型检查

### 长期 (本月)
1. 考虑迁移到 TypeScript 5.4+ 的新特性
2. 评估 Vue 3.4+ 的类型改进
3. 优化构建性能

## 遇到的坑和经验教训

### 1. pnpm workspace 与 TypeScript 的冲突
**教训**: workspace 包链接会让 TypeScript 尝试编译源文件  
**最佳实践**: 始终使用 `paths` 映射 + `exclude` 源目录

### 2. tsconfig 继承的隐患
**教训**: 根 tsconfig 的设置会被子包继承，包括 `noEmit`  
**最佳实践**: 子包应显式覆盖所有构建相关选项

### 3. 严格模式的渐进式启用
**教训**: 一次性启用所有严格选项会产生数百个错误  
**最佳实践**: 按包逐步启用，优先修复核心包

### 4. any 类型的替代方案
**教训**: `any` 破坏类型安全但很方便  
**最佳实践**:
- 外部库类型：使用 `unknown` + 类型守卫
- 内部 API：创建具体类型
- Vue 组件：使用 `Component` 类型

## 下一步行动

```bash
# 1. 修复 spark-renderer
cd packages/spark-renderer
# 添加 src/shims-vue.d.ts
# 修复 usePageDataSet.ts 的类型错误

# 2. 重新构建
pnpm run build

# 3. 验证主应用
cd ../..
pnpm install
pnpm run dev

# 4. 运行测试
pnpm run test
```

## 参考资料

- [TypeScript 严格模式文档](https://www.typescriptlang.org/tsconfig#strict)
- [Vue 3 TypeScript 指南](https://vuejs.org/guide/typescript/overview.html)
- [SOLID 原则](https://en.wikipedia.org/wiki/SOLID)
- 项目架构文档: `docs/SPARK_ARCHITECTURE.md`
- 依赖规则: `docs/DEPENDENCY_RULES.md`
