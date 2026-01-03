# Form-Create Designer 自定义组件扩展指南

> 本文档总结了为 form-create-designer 扩展自定义布局组件的完整流程和最佳实践

## 📋 目录

1. [扩展流程概述](#扩展流程概述)
2. [第一步：创建 Vue 组件](#第一步创建-vue-组件)
3. [第二步：定义 DragRule](#第二步定义-dragrule)
4. [第三步：注册组件](#第三步注册组件)
5. [关键问题与解决方案](#关键问题与解决方案)
6. [待完成工作](#待完成工作)
7. [最佳实践](#最佳实践)

---

## 扩展流程概述

扩展自定义组件需要三个核心步骤：

```
┌─────────────────────┐
│  1. 创建 Vue 组件   │  → 实现组件的渲染逻辑
│  (layout-components) │
└─────────────────────┘
          ↓
┌─────────────────────┐
│ 2. 定义 DragRule    │  → 配置设计器中的行为
│ (designer-components)│
└─────────────────────┘
          ↓
┌─────────────────────┐
│  3. 注册到设计器    │  → 使组件在设计器中可用
│     (DslEditor)      │
└─────────────────────┘
```

---

## 第一步：创建 Vue 组件

**文件位置**: `packages/runtime/src/layout-components.ts`

### 组件要求

1. **支持 `children` 属性**：用于接收拖入的子组件
2. **支持默认插槽**：用于运行时渲染
3. **支持 `formCreateInject`**：设计器集成所需
4. **类型安全**：使用 TypeScript 定义 props

### 示例代码

```typescript
import { defineComponent, h, PropType } from 'vue';

/**
 * fc-container - 容器组件
 */
export const FcContainer = defineComponent({
  name: 'FcContainer',
  props: {
    class: String,
    style: [String, Object] as PropType<string | Record<string, any>>,
    children: [Array, String] as PropType<any[] | string>,  // form-create 使用
    formCreateInject: Object  // 设计器注入
  },
  setup(props, { slots }) {
    return () => h(
      'div',
      {
        class: ['fc-container', props.class],
        style: props.style
      },
      // 优先使用 children prop，否则使用插槽
      normalizeChildren(props.children) || slots.default?.()
    );
  }
});

// 辅助函数：标准化 children
function normalizeChildren(children: any[] | string | undefined): any {
  if (!children) return undefined;
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children;
  return undefined;
}

// 导出组件映射
export const layoutComponents = {
  'fc-container': FcContainer,
  'fc-header': FcHeader,
  // ... 其他组件
};
```

### 关键点

- ✅ 使用 `defineComponent` 确保类型安全
- ✅ 使用 `h()` 函数手动渲染（更灵活）
- ✅ 同时支持 `children` prop 和 `<slot>` 两种方式
- ✅ 使用 kebab-case 命名（`fc-container` 而非 `FcContainer`）

---

## 第二步：定义 DragRule

**文件位置**: `packages/runtime/src/designer-components.ts`

### DragRule 接口

```typescript
export interface DragRule {
  icon: string;          // 组件图标（如 'icon-container'）
  label: string;         // 显示名称（如 '容器'）
  name: string;          // 唯一标识（如 'fc-container'）
  menu: 'main' | 'aide' | 'layout' | 'subform';  // 菜单分类
  
  // 容器组件特有属性
  drag?: boolean;        // 是否可拖入子组件（容器必须为 true）
  inside?: boolean;      // 操作按钮是否在内部（容器建议为 true）
  mask?: boolean;        // 是否显示遮罩（容器必须为 false）
  
  // 生成规则函数（容器组件无参数）
  rule: () => any;
  
  // 属性配置函数（可选）
  props?: (rule: any, arg: { t: (key: string) => string; api: any }) => any[];
}
```

### 完整示例

```typescript
const fcContainer: DragRule = {
  icon: 'icon-container',
  label: '容器',
  name: 'fc-container',
  menu: 'layout',
  
  // 容器配置（三要素）
  drag: true,      // 可拖入子组件
  inside: true,    // 操作按钮在内部
  mask: false,     // 不显示遮罩
  
  // 规则生成函数（无参数！）
  rule() {
    return {
      type: 'fc-container',  // 对应 Vue 组件名
      props: {
        class: '',
        style: {}
      },
      children: []  // 初始化空子组件数组
    };
  },
  
  // 属性配置面板
  props(_, { t }) {
    return [
      {
        type: 'input',      // 输入框
        field: 'class',     // 映射到 props.class
        title: 'CSS 类名'
      },
      {
        type: 'slider',     // 滑块
        field: 'span',
        title: '栅格占据列数',
        value: 12,
        props: { min: 1, max: 24 }
      },
      {
        type: 'select',     // 下拉选择
        field: 'justify',
        title: '水平排列',
        value: 'start',
        options: [
          { label: '左对齐', value: 'start' },
          { label: '居中', value: 'center' }
        ]
      }
    ];
  }
};

// 导出组件列表
export const customLayoutComponents: DragRule[] = [
  fcContainer,
  fcHeader,
  // ...
];
```

### 关键发现

#### ⚠️ 容器组件 vs 表单组件的区别

| 特性 | 容器组件 | 表单组件 |
|------|---------|---------|
| `rule` 函数 | `rule() { ... }` **无参数** | `rule({t}) { ... }` 有参数 |
| `props` 函数 | `props(_, {t}) { ... }` | `props(rule, {t, api}) { ... }` |
| `drag` 属性 | `true` | 不需要 |
| `mask` 属性 | `false` | `true` 或不设置 |
| `inside` 属性 | `true` | 不需要 |

#### ❌ 不需要的属性

根据官方源码，**不要**添加以下属性：
- ❌ `dragBtn` - 会导致注册失败
- ❌ `children: 'children'` - 不是必需的

---

## 第三步：注册组件

**文件位置**: `packages/demo-site/src/views/DslEditor.vue`

### 🎯 正确的注册方式

```typescript
import { customLayoutComponents, layoutComponents } from '@spark-view/runtime';
import FormCreate from '@form-create/element-ui';
import * as Designer from '@form-create/designer';

const FormCreateDesigner = (Designer as any).default || Designer;
const formCreateInstance = (Designer as any).formCreate || FormCreate;

// 第一步：注册 Vue 组件（模块加载时）
Object.entries(layoutComponents).forEach(([name, component]) => {
  formCreateInstance.component(name, component);
  console.log(`✅ 已注册 Vue 组件: ${name}`);
});

// 第二步：注册 DragRule（模块加载时，在设计器实例创建前）
if (FormCreateDesigner && typeof FormCreateDesigner.addDragRule === 'function') {
  customLayoutComponents.forEach((dragRule) => {
    FormCreateDesigner.addDragRule(dragRule);
    console.log(`✅ 已注册 DragRule: ${dragRule.label}`);
  });
}

// 第三步：在 onMounted 中验证（可选，仅用于调试）
onMounted(() => {
  nextTick(() => {
    if (designerRef.value) {
      const dragRuleList = (designerRef.value as any).dragRuleList;
      console.log('📊 dragRuleList 总数:', Object.keys(dragRuleList).length);
      
      customLayoutComponents.forEach(comp => {
        const exists = dragRuleList[comp.name];
        console.log(`${comp.name}:`, exists ? '✅ 已注册' : '❌ 未注册');
      });
    }
  });
});
```

### 注册时机的重要性

| 方式 | 时机 | 结果 |
|------|------|------|
| ✅ `FormCreateDesigner.addDragRule()` | 模块加载时（静态） | **成功** - 设计器初始化时已包含 |
| ❌ `designerRef.value.addComponent()` | onMounted（动态） | **失败** - 虽然添加到 dragRuleList，但 menuList 未同步 |
| ❌ `:menu` prop | 模板属性 | **失败** - 错误的 API |

### 调试技巧

```typescript
// 检查设计器实例结构
console.log('设计器属性数量:', Object.keys(designerRef.value).length);
console.log('dragRuleList 位置:', Object.keys(designerRef.value).indexOf('dragRuleList'));

// 检查注册状态
const dragRuleList = (designerRef.value as any).dragRuleList;
console.log('注册前:', Object.keys(dragRuleList).length);
// ... 注册 ...
console.log('注册后:', Object.keys(dragRuleList).length);

// 检查菜单
const menuList = (designerRef.value as any).menuList;
const layoutMenu = menuList.find((m: any) => m.name === 'layout');
console.log('layout 菜单组件数:', layoutMenu.list.length);
```

---

## 关键问题与解决方案

### 问题 1: `TypeError: h2 is not a function`

**原因**: 组件没有定义 `props` 函数，设计器尝试获取属性配置时失败

**解决方案**: 
```typescript
props(_, { t }) {
  return [
    {
      type: 'input',
      field: 'class',
      title: 'CSS 类名'
    }
  ];
}
```

### 问题 2: `Cannot read properties of undefined (reading 'rule')`

**原因**: `rule` 函数签名错误

**错误写法**: `rule({ t }) { ... }`  ← 容器组件不需要参数
**正确写法**: `rule() { ... }`

### 问题 3: 组件在 dragRuleList 中但不显示

**原因**: 使用 `designerRef.value.addComponent()` 只更新了 `dragRuleList`，没有更新 `menuList`

**解决方案**: 使用静态方法 `FormCreateDesigner.addDragRule()` 在模块加载时注册

### 问题 4: 组件名称冲突担忧

**发现**: 官方使用驼峰命名（如 `fcRow`），我们使用 kebab-case（如 `fc-row`），**实际上不冲突**

**验证方式**:
```bash
# 搜索本地 designer 包
grep -r "name.*fcRow" node_modules/@form-create/designer/
# 结果：官方是 'fcRow'，我们的 'fc-row' 完全不同
```

---

## 待完成工作

### 🚧 渲染层面的问题

目前的工作只完成了**设计器集成**，还需要处理：

#### 1. DSL 解析渲染

**问题**: DSL 解析器可能不认识自定义组件

**当前状态**:
```json
{
  "type": "fc-container",
  "props": { "class": "my-class" },
  "children": [...]
}
```

**需要做的**:
- [ ] 在 `dsl-parser` 中添加自定义组件的解析规则
- [ ] 在 `PageRenderer` 中注册自定义组件
- [ ] 测试自定义组件的嵌套渲染

#### 2. 运行时渲染验证

**需要测试**:
- [ ] 导出包含自定义组件的 DSL
- [ ] 在预览/运行时模式下渲染
- [ ] 验证 `children` 属性正确传递
- [ ] 验证样式、类名正确应用

#### 3. 跨包依赖

**需要确认**:
- [ ] `@spark-view/runtime` 包是否正确导出所有组件
- [ ] `demo-site` 是否能正确导入和使用
- [ ] 类型定义是否完整

#### 4. SSR 支持

**如果需要服务端渲染**:
- [ ] 在 `ssr-server` 中注册自定义组件
- [ ] 测试服务端渲染输出
- [ ] 验证客户端激活（hydration）

---

## 最佳实践

### ✅ DO（推荐做法）

1. **使用 kebab-case 命名组件**
   ```typescript
   name: 'fc-container'  // ✅ 清晰、避免冲突
   ```

2. **在模块加载时注册**
   ```typescript
   FormCreateDesigner.addDragRule(dragRule);  // ✅ 静态注册
   ```

3. **容器组件三要素**
   ```typescript
   drag: true,    // ✅ 可拖入子组件
   inside: true,  // ✅ 操作按钮在内部
   mask: false    // ✅ 不显示遮罩
   ```

4. **提供 props 配置**
   ```typescript
   props(_, { t }) {  // ✅ 避免 h2 not a function 错误
     return [{ type: 'input', field: 'class', title: 'CSS类名' }];
   }
   ```

5. **同时支持 children 和 slot**
   ```typescript
   normalizeChildren(props.children) || slots.default?.()  // ✅ 兼容性强
   ```

### ❌ DON'T（避免的做法）

1. ❌ **不要在 onMounted 中使用 `addComponent()`**
   ```typescript
   designerRef.value.addComponent(...)  // ❌ menuList 不同步
   ```

2. ❌ **容器组件不要有 `rule` 参数**
   ```typescript
   rule({ t }) { ... }  // ❌ 容器组件不需要参数
   ```

3. ❌ **不要添加未经验证的属性**
   ```typescript
   dragBtn: false,      // ❌ 可能导致注册失败
   children: 'children' // ❌ 不是必需的
   ```

4. ❌ **不要使用驼峰命名与官方冲突**
   ```typescript
   name: 'fcRow'  // ❌ 与官方冲突
   ```

5. ❌ **不要忘记构建 runtime 包**
   ```bash
   # ❌ 直接测试
   # ✅ 先构建再测试
   cd packages/runtime && pnpm build
   ```

---

## 快速检查清单

在添加新组件时，使用此清单确保所有步骤完成：

### Vue 组件
- [ ] 定义了 `name` 属性
- [ ] 支持 `children` prop
- [ ] 支持 `formCreateInject` prop
- [ ] 支持默认插槽
- [ ] 实现了 `normalizeChildren` 逻辑
- [ ] 导出到 `layoutComponents` 对象

### DragRule
- [ ] 设置了唯一的 `name`（kebab-case）
- [ ] 设置了 `menu: 'layout'`
- [ ] 容器组件：`drag: true, inside: true, mask: false`
- [ ] `rule()` 函数**无参数**
- [ ] 定义了 `props()` 函数（至少一个输入项）
- [ ] 添加到 `customLayoutComponents` 数组

### 注册
- [ ] 在模块加载时使用 `formCreateInstance.component()` 注册 Vue 组件
- [ ] 在模块加载时使用 `FormCreateDesigner.addDragRule()` 注册 DragRule
- [ ] 构建了 runtime 包 (`pnpm build`)
- [ ] 重启了开发服务器
- [ ] 在浏览器中验证组件出现在菜单中
- [ ] 测试拖拽功能
- [ ] 测试属性配置
- [ ] 测试嵌套子组件

### 待办（渲染部分）
- [ ] 在 DSL 解析器中添加组件映射
- [ ] 在 PageRenderer 中注册组件
- [ ] 测试导出/导入 DSL
- [ ] 测试预览模式渲染
- [ ] 测试 SSR（如果需要）

---

## 参考资源

- [Form-Create 官方文档](https://form-create.com/v3/guide/)
- [Form-Create Designer Pro 文档](https://pro.form-create.com/doc/)
- [扩展组件教程](https://pro.form-create.com/doc/component)
- [扩展容器组件](https://pro.form-create.com/doc/col)
- [本地 Designer 源码](../../packages/demo-site/node_modules/@form-create/designer/src/config/rule/)

---

## 总结

今天的主要成果：

1. ✅ **成功扩展了 7 个自定义布局组件**
   - fc-container, fc-header, fc-footer, fc-section, fc-hero, fc-row, fc-col

2. ✅ **掌握了正确的注册流程**
   - 模块加载时使用静态方法 `FormCreateDesigner.addDragRule()`

3. ✅ **发现了关键技术细节**
   - 容器组件的 `rule()` 无参数
   - 必须提供 `props()` 函数
   - `drag/inside/mask` 三要素配置

4. ✅ **验证了无冲突**
   - 我们的 kebab-case 命名与官方驼峰命名不冲突

5. 🚧 **明确了后续工作**
   - DSL 解析渲染集成
   - 运行时渲染验证
   - SSR 支持（如需要）

**下次继续的重点**: 完成渲染层面的集成，确保自定义组件在预览/运行时正确渲染。
