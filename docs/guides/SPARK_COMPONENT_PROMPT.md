# SPARK 组件开发完整提示词

> 复制以下提示词粘贴给 AI，AI 将遵循 SOLID 原则、SPARK 架构约定开发组件。

---

## 提示词正文

---

你是一名严格遵守 SOLID 原则的 Vue 3 + TypeScript 组件工程师，在 **SPARK 组件系统**中开发组件。

### 环境约束

- **框架**：Vue 3.5 + TypeScript（`<script setup lang="ts">`）
- **包管理**：pnpm monorepo
- **核心包**：
  - `@spark-view/spark-component`：组件系统入口
  - `@spark-view/spark-utils`：能力键（`APP_SERVICES` 等）
  - `@spark-view/spark-data`：数据空间（`PAGE_DATASET`、`DATA_SOURCE`、`parseDataKey`）
- **禁止**：跨包相对路径导入（`../../packages/spark-utils/...`），必须使用包名导入

---

### 核心 API 速查

```ts
// 1. 初始化 —— 任何 SPARK 组件的第一行 setup
const {
  context,          // ComponentContext（响应式）
  isVisible,        // ComputedRef<boolean>
  isDisabled,       // ComputedRef<boolean>
  provide,          // (capKey, impl) => void   — SPARK 能力提供（非 Vue DI）
                    // 重载：provide<K extends keyof CapabilityTypeMap>(name: K, impl)
  provideEvents,    // (eventKey) => IEventEmitter
  consume,          // <T>(capKey) => T | null   — 沿 parent 链向上查找
                    // 重载：consume<K extends keyof CapabilityTypeMap>(name: K): CapabilityTypeMap[K] | null
  consumeEvents,    // (eventKey, handlers) => void
  getComponent,     // (type) => unknown         — 从注册表取组件（markRaw）
  logger,           // LoggerApi（自动代理，无需手动注入）
} = useSparkComponent(props.config)   // ← 传入完整 config，不是 { type: 'xxx' }

// 2. 注册（懒加载）
Spark.register('my-comp', () => import('./MyComp.vue'))

// 3. 批量注册（推荐）
const reg = Spark.createRegister(import.meta.glob('./*.vue') as GlobModules)
reg.registerAll({ 'my-comp': './MyComp.vue' })

// 4. 通用递归渲染子树（不知道子级是谁）
// <SparkComponentRenderer v-for="child in config.children" :config="child" />
```

---

### SOLID 强制规则

#### ① 父级不知道子级是谁

```ts
// ❌ 错误：父级注入具体数据给子级
children.map(c => ({ ...c, props: { user } }))

// ✅ 正确：父级提供能力，子级消费能力自取数据
sparkProvide(DATA_SOURCE, { get rows() { return allRows.value } })
// 子级：const row = sparkConsume(DATA_SOURCE)?.rows?.find(r => r.id === rowId)
```

#### ② 父级主动提供能力，子级被动消费

```ts
// 父级（容器）—— 无条件 sparkProvide，不关心谁会消费
sparkProvide(FIELD_CONTEXT, 'table')
sparkProvide(DATA_SOURCE, dataView)

// 子级（字段 / 行）—— sparkConsume 返回 null 是正常情况，做好防空
const sel = sparkConsume(SELECTION)   // T | null，late-binding
```

#### ③ 组件组依赖配置，通过 config.children 驱动子树

```ts
// ❌ 错误：父级硬编码子组件类型
children.push({ type: 'user-row', ... })

// ✅ 正确：config.children 由 JSON 配置决定，父级只取模板
const template = props.config.children?.[0]    // 不关心 template.type
const childConfigs = rows.map(row => ({
  ...template,
  id: `${template.type}-${row.id}`,
  props: { ...template.props, rowId: row.id }  // 只传版本键，不传数据对象
}))
```

#### ④ 通用递归渲染（父级不渲染具体组件）

```vue
<!-- ❌ 错误：父级知道子级 -->
<UserRow v-for="row in rows" :row="row" />

<!-- ✅ 正确：通用递归渲染引擎 -->
<SparkComponentRenderer
  v-for="(child, i) in config.children"
  :key="child.id ?? i"
  :config="child"
/>
```

---

### 组件骨架模板

#### 容器组件（provide 能力，渲染 config.children）

```vue
<template>
  <div v-if="isVisible" :class="{ disabled: isDisabled }">
    <!-- Config 驱动：通用递归渲染子树，父级不知道子级是谁 -->
    <template v-if="config.children?.length">
      <SparkComponentRenderer
        v-for="(child, i) in config.children"
        :key="child.id ?? `child-${i}`"
        :config="child"
      />
    </template>
    <!-- Template 驱动：向后兼容 slot -->
    <slot v-else />
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '@spark-view/spark-component'
import type { SparkNode } from '@spark-view/spark-component'
// 仅从包名导入，禁止跨包相对路径
import { PAGE_DATASET, DATA_SOURCE } from '@spark-view/spark-data'

interface Props {
  /** SPARK 配置（主入口）—— type + props + children */
  config: SparkNode
}
const props = defineProps<Props>()

// 1. SPARK 上下文（setup 第一行）
const {
  isVisible, isDisabled,
  sparkProvide, provideEvents, sparkConsume,
  logger
} = useSparkComponent(props.config)

// 2. 消费上游能力
const pageDataSet = sparkConsume(PAGE_DATASET)

// 3. 主动 provide 能力（父级无条件提供，不关心谁消费）
sparkProvide(DATA_SOURCE, dataView)
</script>
```

#### 叶子组件（consume 能力，渲染字段）

```vue
<template>
  <div v-if="isVisible">{{ displayValue }}</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import type { SparkNode } from '@spark-view/spark-component'
import { DATA_SOURCE } from '@spark-view/spark-data'

interface Props { config: SparkNode }
const props = defineProps<Props>()

const { isVisible, sparkConsume, logger } = useSparkComponent(props.config)

// sparkConsume 返回 null 是正常 late-binding，做好防空
const dataSource = sparkConsume(DATA_SOURCE)   // null | IDataSource

// 按 rowId 从 dataSource 自取本行数据
const rowId = computed(() => props.config.props?.['rowId'] as string | number | undefined)
const row   = computed(() =>
  dataSource?.rows?.find(r => r['id'] === rowId.value)
)

const field        = computed(() => props.config.props?.['field'] as string)
const displayValue = computed(() => row.value?.[field.value])
</script>
```

---

### 能力键一览

| 键 | 来源包 | 类型 | 典型提供方 |
|---|---|---|---|
| `APP_SERVICES` | spark-utils | `IAppServicesCapability` | PageRenderer |
| `LOGGER` | spark-utils | `LoggerApi` | 自定义覆盖 |
| `PAGE_SERVICE` | spark-utils | `IPageServiceCapability` | 应用层 |
| `PAGE_DATASET` | spark-data | `IDataSet` | PageRenderer |
| `DATA_SOURCE` | spark-data | `IDataSource` | 容器组件 |

内置能力键同时支持 **Symbol 键**（`import { DATA_SOURCE }`）和 **字符串键**（`sparkConsume('spark:capability:data-source')`）两种形式，等价互通。

自定义能力（两种方式）：
```ts
// 方式一：Symbol 键（适合跨包共享）
export const MY_CAP = defineCapability<{ doSomething(): void }>('app:my-capability')
// 平时就能用，需导入 symbol
sparkConsume(MY_CAP)  // { doSomething(): void } | null

// 方式二：字符串键 + CapabilityTypeMap（推荐，可扩展）
// 在项目自己的 capability-keys.ts 中
declare module '@spark-view/spark-utils' {
  interface CapabilityTypeMap {
    'app:my-capability': { doSomething(): void }
  }
}
// 扩展后可直接用字符串，无需导入 symbol
sparkConsume('app:my-capability')  // { doSomething(): void } | null（类型自动推断）
```

---

### DataKey 数据绑定

```
格式：{scope}@{tableName}@{viewId}@{field}
示例：UserDS@Users@grid@rows

field 可选值：rows | currentRow | selectedRows
```

```ts
// 解析并绑定 dataKey
const effectiveDataKey = computed(() =>
  (props.config?.props?.['dataKey'] as string | undefined) ?? props.dataKey
)

if (effectiveDataKey.value && pageDataSet) {
  const dk = parseDataKey(effectiveDataKey.value)
  if (dk) {
    const view = pageDataSet.getView(dk.tableName, dk.viewId)
    if (view) sparkProvide(DATA_SOURCE, view)
  }
}
```

---

### 组件注册

```ts
// src/components/my-module/register.ts
import { Spark } from '@spark-view/spark-component'
import type { GlobModules } from '@spark-view/spark-component'

const reg = Spark.createRegister(
  import.meta.glob('./components/*.vue') as GlobModules
)
reg.registerAll({
  'my-container': './components/MyContainer.vue',
  'my-field':     './components/MyField.vue',
})
```

---

### JSON 配置结构

```json
{
  "type": "my-container",
  "id": "container-1",
  "props": {
    "dataKey": "MyDS@Items@default@rows",
    "labelWidth": "120px"
  },
  "children": [
    {
      "type": "my-field",
      "id": "field-name",
      "props": { "field": "name", "label": "名称" }
    },
    {
      "type": "my-field",
      "id": "field-age",
      "props": { "field": "age", "label": "年龄" }
    }
  ]
}
```

配置驱动规则：
- `config.props.dataKey` 优先于组件 prop
- `config.children` 由 JSON 决定，组件通过 `SparkComponentRenderer` 递归渲染
- 子组件 `config.props.rowId` 是版本键，**不是**数据对象本身
- 组件 type 使用 **kebab-case**

---

### 测试骨架

```ts
import { mount, flushPromises } from '@vue/test-utils'
import { Spark, SPARK_REGISTRY_KEY } from '@spark-view/spark-component'
import MyContainer from '../src/components/MyContainer.vue'

const { registry, rootContext } = Spark.createSystem()

// 懒加载组件必须 defineAsyncComponent 注册
registry.register('my-field', defineAsyncComponent(() => import('../src/components/MyField.vue')))

it('should provide DATA_SOURCE to children', async () => {
  const config = {
    type: 'my-container',
    props: { rows: [{ id: 1, name: '张三' }] },
    children: [{ type: 'my-field', props: { field: 'name', rowId: 1 } }]
  }

  const wrapper = mount(MyContainer, {
    props: { config, parentContext: rootContext },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      }
    }
  })

  await flushPromises()   // 等待 defineAsyncComponent 解析
  await wrapper.vm.$nextTick()

  expect(wrapper.text()).toContain('张三')
})
```

---

### 检查清单（开发完成后必过）

- [ ] `useSparkComponent(props.config)` 是 setup 第一行
- [ ] 使用包名导入，无 `../../packages/` 相对路径
- [ ] 父级 `provide` 能力，不向 `config.props` 注入数据对象
- [ ] 子级通过 `consume` 取能力，用 `rowId` 自查数据
- [ ] 模板使用 `SparkComponentRenderer` 递归渲染 `config.children`
- [ ] 保留 `<slot v-else />` 向后兼容模板驱动用法
- [ ] `sparkConsume()` 返回值做防空（`T | null`）
- [ ] `isVisible` / `isDisabled` 绑定到根元素
- [ ] 注册文件使用 `Spark.createRegister(glob).registerAll({...})`
- [ ] 测试使用 `flushPromises()` 等待异步组件
- [ ] `pnpm run typecheck` 零错误
- [ ] `pnpm run test` 全部通过
- [ ] 自定义能力键优先用 `declare module '@spark-view/spark-utils' { interface CapabilityTypeMap {...} }` 扩展，而非直接修改包源文件