# 组件文档编写指南 - AI 知识库增强

## 📚 概述

为了让 AI 能够更好地理解和生成组件代码，我们在构建过程中自动提取组件的详细元数据。通过编写规范的 JSDoc 注释，可以极大增强 AI 知识库的质量。

## 🎯 自动提取的元数据

### 基础信息
- **组件名称**: 组件的唯一标识
- **显示名称**: 友好的组件名称
- **描述**: 组件的功能说明
- **标签**: JSDoc 标签（@author, @since, @example 等）

### 属性 (Props)
- **名称**: 属性名称
- **类型**: TypeScript 类型（含泛型、联合类型等）
- **必需**: 是否为必填属性
- **默认值**: 默认值及其类型
- **描述**: 属性的详细说明
- **标签**: JSDoc 标签（@deprecated, @see 等）
- **枚举值**: 如果是枚举类型，自动提取所有可选值

### 事件 (Events)
- **名称**: 事件名称
- **描述**: 事件触发时机和用途
- **类型**: 事件载荷类型
- **参数**: 事件参数详情
- **标签**: JSDoc 标签

### 插槽 (Slots)
- **名称**: 插槽名称
- **描述**: 插槽的用途
- **绑定数据**: 插槽作用域传递的数据
- **标签**: JSDoc 标签

### 方法 (Methods)
- **名称**: 方法名称（如果通过 `defineExpose` 暴露）
- **描述**: 方法功能说明
- **参数**: 参数列表及类型
- **返回值**: 返回值类型和说明
- **标签**: JSDoc 标签

### 复杂度统计
- **Props 数量**: 便于 AI 判断组件复杂度
- **Events 数量**: 交互复杂度指标
- **Slots 数量**: 扩展性指标
- **Methods 数量**: API 复杂度指标

## ✍️ 推荐的注释风格

### 1. 组件级注释

```vue
<script setup lang="ts">
/**
 * 用户信息卡片组件
 * 
 * 显示用户的基本信息，支持头像、姓名、邮箱等字段的展示
 * 
 * @component UserCard
 * @example
 * ```vue
 * <UserCard :user="userData" @click="handleClick" />
 * ```
 * 
 * @author Your Name
 * @since v1.0.0
 */

// 组件代码...
</script>
```

### 2. Props 注释

```typescript
interface Props {
  /**
   * 用户数据对象
   * @required
   * @example { id: 1, name: 'John', email: 'john@example.com' }
   */
  user: User

  /**
   * 是否显示头像
   * @default true
   */
  showAvatar?: boolean

  /**
   * 卡片尺寸
   * @values 'small' | 'medium' | 'large'
   * @default 'medium'
   */
  size?: 'small' | 'medium' | 'large'

  /**
   * 点击行为类型
   * @deprecated 使用 @click 事件替代
   */
  clickAction?: string
}
```

### 3. Events 注释

```typescript
/**
 * 用户卡片被点击时触发
 * @event click
 * @param {User} user - 被点击的用户对象
 * @param {MouseEvent} event - 原生鼠标事件
 */
const emit = defineEmits<{
  click: [user: User, event: MouseEvent]
  
  /**
   * 用户信息更新时触发
   * @param {Partial<User>} changes - 变更的字段
   */
  update: [changes: Partial<User>]
}>()
```

### 4. Slots 注释

```vue
<template>
  <div class="user-card">
    <!-- 
      @slot header - 卡片头部插槽
      @binding {User} user - 用户数据
      @binding {boolean} loading - 加载状态
    -->
    <slot name="header" :user="user" :loading="loading"></slot>

    <!-- 
      @slot default - 默认内容插槽
      @binding {User} user - 用户数据
    -->
    <slot :user="user"></slot>
  </div>
</template>
```

### 5. Methods 注释（暴露的方法）

```typescript
/**
 * 刷新用户数据
 * @public
 * @async
 * @param {boolean} force - 是否强制刷新缓存
 * @returns {Promise<void>}
 * @throws {Error} 当网络请求失败时
 * @example
 * ```typescript
 * await userCardRef.value?.refresh(true)
 * ```
 */
async function refresh(force = false) {
  // 实现...
}

defineExpose({
  refresh
})
```

## 📊 生成的知识库结构

构建后会生成 `component-library.json`：

```json
{
  "UserCard": {
    "name": "UserCard",
    "displayName": "UserCard",
    "description": "用户信息卡片组件，显示用户的基本信息",
    "tags": {
      "author": "Your Name",
      "since": "v1.0.0"
    },
    "props": [
      {
        "name": "user",
        "type": { "name": "User" },
        "required": true,
        "description": "用户数据对象",
        "tags": {
          "example": "{ id: 1, name: 'John', email: 'john@example.com' }"
        }
      },
      {
        "name": "showAvatar",
        "type": { "name": "boolean" },
        "required": false,
        "defaultValue": { "value": "true" },
        "description": "是否显示头像",
        "tags": {}
      },
      {
        "name": "size",
        "type": { "name": "union" },
        "required": false,
        "defaultValue": { "value": "'medium'" },
        "description": "卡片尺寸",
        "values": ["'small'", "'medium'", "'large'"],
        "tags": {}
      }
    ],
    "events": [
      {
        "name": "click",
        "description": "用户卡片被点击时触发",
        "type": { "name": "void" },
        "properties": [
          { "name": "user", "type": "User", "description": "被点击的用户对象" },
          { "name": "event", "type": "MouseEvent", "description": "原生鼠标事件" }
        ],
        "tags": {}
      }
    ],
    "slots": [
      {
        "name": "header",
        "description": "卡片头部插槽",
        "bindings": [
          { "name": "user", "title": "binding" },
          { "name": "loading", "title": "binding" }
        ],
        "tags": {}
      }
    ],
    "methods": [
      {
        "name": "refresh",
        "description": "刷新用户数据",
        "params": [
          { "name": "force", "type": "boolean", "description": "是否强制刷新缓存" }
        ],
        "returns": { "type": "Promise<void>" },
        "tags": {
          "async": true,
          "public": true,
          "throws": "当网络请求失败时"
        }
      }
    ],
    "complexity": {
      "propsCount": 3,
      "eventsCount": 1,
      "slotsCount": 1,
      "methodsCount": 1
    },
    "sourcePath": "src/components/UserCard.vue"
  }
}
```

## 🤖 AI 使用场景

### 1. 智能组件推荐
AI 可以根据用户需求，从知识库中推荐最合适的组件

### 2. 自动代码生成
基于组件元数据，AI 可以生成正确的组件使用代码

### 3. 参数验证
AI 可以检查组件使用是否符合约束（必需参数、类型匹配等）

### 4. 自动补全
开发工具可以基于知识库提供智能提示

### 5. 文档生成
自动生成组件 API 文档和示例

## 🔄 自动化流程

1. **开发**: 编写组件，添加 JSDoc 注释
2. **构建**: 运行 `pnpm run build`
3. **提取**: 自动扫描并提取元数据
4. **生成**: 更新 `component-library.json`
5. **使用**: AI 读取知识库，辅助开发

## 💡 最佳实践

1. **详细描述**: 为每个 prop、event、slot 添加清晰的描述
2. **类型完整**: 使用 TypeScript 明确定义所有类型
3. **示例代码**: 在注释中提供使用示例
4. **标注弃用**: 使用 `@deprecated` 标记废弃的 API
5. **关联引用**: 使用 `@see` 关联相关组件
6. **版本追踪**: 使用 `@since` 标记功能引入版本

## 📈 知识库质量指标

- **覆盖率**: 所有公开组件都有完整文档
- **详细度**: 每个 API 都有描述和示例
- **准确性**: 类型定义与实现完全一致
- **可维护性**: 代码变更自动更新知识库
