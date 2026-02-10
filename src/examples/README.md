# SPARK 示例代码

本目录包含 SPARK 组件系统的所有示例代码。

## 📁 目录结构

```
src/examples/                    # ✅ 可执行的示例代码
  ├── index.ts                   # 示例索引
  ├── auto-loader/               # AutoLoader 运行时注册示例
  │   ├── basic-usage.ts         # 基础使用
  │   └── performance-monitoring.ts  # 性能监控
  └── build-time-registration/   # 编译时注册示例
      └── basic-usage.ts         # 基础使用

docs/examples/                   # 📄 Markdown 文档示例
  ├── auto-loader-examples.md    # AutoLoader 完整示例集
  └── build-time-registration-examples.md  # 编译时注册完整示例集
```

## 🎯 两种示例形式

### 1. 可执行代码 (`src/examples/`)

**优势**：
- ✅ 完整的 TypeScript 类型检查
- ✅ IDE 智能提示和自动补全
- ✅ 可以直接运行和调试
- ✅ 使用项目别名 (`@/`) 导入

**使用方式**：
```typescript
// 导入并使用
import { basicUsage } from '@/examples/auto-loader/basic-usage'

await basicUsage()
```

### 2. Markdown 文档 (`docs/examples/`)

**优势**：
- ✅ 更易阅读和浏览
- ✅ 包含详细说明和注释
- ✅ 可以直接复制粘贴
- ✅ 适合学习和参考

**使用方式**：
直接查看 Markdown 文件，复制所需代码片段。

## 📚 可用示例

### AutoLoader（运行时注册）

| 示例 | 文件 | 说明 |
|------|------|------|
| 基础使用 | `src/examples/auto-loader/basic-usage.ts` | 最简单的使用方式 |
| 性能监控 | `src/examples/auto-loader/performance-monitoring.ts` | 性能统计和监控 |
| 完整文档 | `docs/examples/auto-loader-examples.md` | 10 个完整示例 |

### 编译时注册（推荐生产环境）

| 示例 | 文件 | 说明 |
|------|------|------|
| 基础使用 | `src/examples/build-time-registration/basic-usage.ts` | 零运行时开销 |
| 完整文档 | `docs/examples/build-time-registration-examples.md` | 12 个完整示例 |

## 🚀 快速开始

### 方式 1: 使用可执行示例

```typescript
// main.ts
import { basicUsage } from '@/examples/auto-loader/basic-usage'

// 运行示例
await basicUsage()
```

### 方式 2: 从文档复制代码

1. 打开 `docs/examples/auto-loader-examples.md`
2. 找到所需示例
3. 复制代码到你的项目中
4. 根据需要调整导入路径

## 📝 添加新示例

1. **在 `src/examples/` 创建新文件**（可执行代码）
   ```typescript
   // src/examples/auto-loader/custom-strategy.ts
   export function customStrategy() {
     // 示例代码
   }
   ```

2. **在 `src/examples/index.ts` 添加导出**
   ```typescript
   export * from './auto-loader/custom-strategy'
   ```

3. **在 `docs/examples/*.md` 添加文档**（可选）
   ```markdown
   ## 示例 X: 自定义策略
   
   \`\`\`typescript
   // 示例代码和说明
   \`\`\`
   ```

## 🔍 为什么这样设计？

### 问题

之前将示例代码放在 `docs/examples/*.ts`，导致：
- ❌ 路径问题：需要使用 `../../src/...` 这种复杂路径
- ❌ 类型检查困难：相对路径可能失效
- ❌ IDE 支持差：无法正确解析别名

### 解决方案

**双重结构**：
- `src/examples/` - 可执行代码（完整类型支持）
- `docs/examples/` - Markdown 文档（易于阅读）

**优势**：
- ✅ 类型安全：使用 `@/` 别名，路径清晰
- ✅ 易于维护：示例代码在 `src` 中，与项目代码一起编译
- ✅ 文档友好：Markdown 格式便于阅读和分享
- ✅ 灵活选择：开发时运行代码，学习时看文档

## 💡 推荐使用

| 场景 | 推荐方式 | 原因 |
|------|---------|------|
| **开发调试** | `src/examples/*.ts` | 完整类型检查，可直接运行 |
| **学习参考** | `docs/examples/*.md` | 易于阅读，包含详细说明 |
| **快速原型** | 复制 Markdown 代码 | 快速复制粘贴 |
| **生产集成** | 参考示例代码逻辑 | 根据实际需求调整 |

## 📖 相关文档

- [AUTO_LOADER.md](../guides/AUTO_LOADER.md) - AutoLoader 完整指南
- [BUILD_TIME_REGISTRATION.md](../guides/BUILD_TIME_REGISTRATION.md) - 编译时注册指南
- [COMPONENT_DEVELOPMENT.md](../guides/COMPONENT_DEVELOPMENT.md) - 组件开发指南
