# @spark-view/spark-component — API 文档

> 版本: 0.1.0 | 基于源码生成

## 目录

1. [Spark 命名空间](#spark-命名空间)
2. [useSparkComponent](#usesparkcomponent)
3. [核心类型](#核心类型)
4. [能力系统](#能力系统)
5. [Vue 插件](#vue-插件)
6. [导出列表](#导出列表)

---

## Spark 命名空间

统一 API 入口，所有注册和配置操作通过 `Spark` 完成。

### `Spark.createRegister(modules)` ⭐ 推荐

绑定 `import.meta.glob` 的注册器，用于路径字符串批量注册。

```typescript
const reg = Spark.createRegister(import.meta.glob('./*.vue'))

// 注册单个（路径字符串 → defineAsyncComponent）
reg.register('user-grid', './UserGrid.vue')
reg.register('user-grid', './UserGrid.vue', { category: 'grid' }) // 带 meta

// 批量注册
reg.registerAll({
  'user-grid': './UserGrid.vue',
  'user-row':  './UserRow.vue',
})
```

### `Spark.register(type, component, meta?)`

注册单个组件。支持同步组件对象和动态导入函数，**不支持路径字符串**（路径字符串请用 `createRegister`）。

```typescript
import UserGrid from './UserGrid.vue'

Spark.register('user-grid', UserGrid)                         // 同步
Spark.register('user-grid', () => import('./UserGrid.vue'))   // 懒加载（自动包装 defineAsyncComponent）
```

### `Spark.registerAll(components, modules?)`

批量注册，不绑定 glob。若 `components` 值为路径字符串，需同时提供 `modules`。

```typescript
Spark.registerAll({
  'user-grid': UserGrid,
  'user-chart': () => import('./UserChart.vue'),
})
```

### `Spark.createPlugin(options?)`

创建 Vue 插件，在 `app.use()` 中安装。

```typescript
// 使用全局 registry（推荐，与 Spark.register() 共享）
app.use(Spark.createPlugin())

// 使用自定义 registry（多实例/测试场景）
const registry = Spark.createRegistry()
app.use(Spark.createPlugin({ registry }))
```

安装后效果：
- Vue DI 注入 `SPARK_REGISTRY_KEY`（注册表）
- Vue DI 注入内部根能力上下文（内部实现键，不再作为公共 API 导出）

### `Spark.getRegistry()`

获取全局组件注册表实例。

### `Spark.createRegistry()`

创建一个隔离的注册表实例，不与全局共享。常用于测试。

### `Spark.createSystem()` —— 测试专用

返回一套隔离的测试系统：

```typescript
const { registry, rootContext, createContext } = Spark.createSystem()

// 创建测试上下文
const parentCtx = createContext({ type: 'parent' })
const childCtx  = createContext({ type: 'child' }, parentCtx)
```

---

## useSparkComponent

每个 SPARK 组件在 `setup()` 中调用一次，获得上下文和能力管理接口。
现在它也是**唯一的能力组合函数入口**；历史上的独立只读/父上下文 hook 已废除。

```typescript
import { useSparkComponent } from '@spark-view/spark-component'

const {
  context,
  isVisible,
  isDisabled,
  sparkProvide,
  provideEvents,
  getProvider,
  sparkConsume,
  consumeEvents,
  initialize,
  destroy,
  logger,
  getComponent,
  isComponentRegistered,
} = useSparkComponent(props.config)
```

### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `config` | `ComponentConfig` | 组件配置，通常来自 `props.config` |
| `options.registry` | `ComponentRegistry?` | 覆盖注入的注册表（测试用） |
| `options.hostContext` | `SparkCapabilityContext?` | 覆盖注入的宿主上下文（测试用） |
| `options.mode` | `'full' \| 'consume-only'` | `full` 返回完整组件能力对象；`consume-only` 仅返回轻量能力读取接口 |

### 轻量只读模式

当组件只需要读取祖先能力、不需要创建自身上下文时，统一使用同一个入口的 `consume-only` 模式：

```typescript
const { host, sparkConsume } = useSparkConsume()

const dataSource = sparkConsume(DATA_SOURCE)
```

该模式适合字段组件、格式化 helper 等高频只读场景。

### 返回值

#### `context: SparkCapabilityContext`

纯能力上下文，包含 `id`、`type`、`capabilities`、`parent` 等最小字段。

额外返回：
- `host.context: SparkCapabilityContext | null`
- `host.type: string | null`

在轻量消费入口 `useSparkConsume()` 下，仅返回：
- `host`
- `sparkConsume()`

#### `isVisible: ComputedRef<boolean>`

当 `config.visible !== false` 时为 `true`（默认可见）。

#### `isDisabled: ComputedRef<boolean>`

当 `config.disabled === true` 时为 `true`（默认不禁用）。

#### `sparkProvide(name, implementation)`

向当前组件的 `context.capabilities` 写入能力。**这是 SPARK 能力系统，不是 Vue 的 `provide/inject`。**

```typescript
import { defineCapability } from '@spark-view/spark-component'

const MY_CAP = defineCapability<{ doWork(): void }>('app:my-cap')
sparkProvide(MY_CAP, { doWork() { console.log('working') } })
```

支持类型安全的 `CapabilityKey<T>`（自动推断实现类型）和裸字符串/Symbol。

#### `provideEvents(name?): IEventEmitter`

创建事件总线并注册为能力，`name` 默认 `'events'`。

```typescript
import { defineCapability } from '@spark-view/spark-component'
import type { IEventEmitter } from '@spark-view/spark-component'

const MY_EVENTS = defineCapability<IEventEmitter>('app:my-events')
const events = provideEvents(MY_EVENTS)
events.emit('rowClick', row)
```

#### `getProvider(name): unknown`

仅在**当前组件**的 `capabilities` Map 中查找，不向父级追溯。

#### `sparkConsume<T>(name): T | null`

沿 `parent` 链向上查找能力（就近原则）。**找不到返回 `null` 是正常情况（late-binding），不应视为错误。**

```typescript
import { APP_SERVICES } from '@spark-view/spark-component'

const services = sparkConsume(APP_SERVICES)
services?.router?.push('/home')
services?.logger?.info('navigated')
```

#### `consumeEvents(name, handlers): IEventEmitter | null`

查找事件总线并批量绑定处理器：

```typescript
consumeEvents(MY_EVENTS, {
  rowClick: (row) => handleRowClick(row),
  refresh: () => reload(),
})
```

#### `initialize() / destroy()`

生命周期钩子，`onMounted` / `onUnmounted` 自动调用，无需手动调用。
`destroy()` 会清理事件订阅和 `capabilities` Map。

#### `logger: LoggerApi`

带优先级的日志代理。解析顺序（无需手动配置）：
1. 最近祖先 `sparkProvide(LOGGER, impl)` 的实现
2. 最近祖先 `sparkProvide(APP_SERVICES, { logger: ... })` 的 logger
3. fallback console

#### `getComponent(type): unknown`

从注册表查找已注册组件，返回值经 `markRaw` 包装（避免 Vue 响应式代理）。

#### `isComponentRegistered(type): boolean`

判断组件类型是否已注册。

---

## 核心类型

### `ComponentConfig`

组件的最小输入类型（可序列化，来自 JSON 配置）。

```typescript
interface ComponentConfig {
  type: string          // kebab-case 组件类型，对应注册名
  id?: string           // 实例 ID（默认运行时自动生成）
  props?: Record<string, unknown>
  children?: ComponentConfig[]
  visible?: boolean     // 默认 true
  disabled?: boolean    // 默认 false
}
```

扩展 `ComponentConfig` 定义业务组件配置：

```typescript
interface MyGridConfig extends ComponentConfig {
  type: 'my-grid'
  pageSize?: number
  columns?: ColumnDef[]
}

defineProps<{ config: MyGridConfig }>()
```

### `SparkCapabilityContext`

组件的最小运行时能力上下文。

```typescript
interface ICapabilityContext {
  id: string
  type: string
  parent?: ICapabilityContext
  capabilities: Map<CapabilityName, unknown>
}

type SparkCapabilityContext = ICapabilityContext
```

### `ComponentDefinition`

注册表中存储的组件条目：

```typescript
interface ComponentDefinition {
  type: string
  component: unknown   // Vue 组件对象
  meta?: Record<string, unknown>
}
```

### `ComponentRegistry`

```typescript
interface ComponentRegistry {
  register(type, component, meta?, options?: { silent?: boolean }): void
  registerOnce(type, component, meta?): boolean
  get(type): ComponentDefinition | undefined
  has(type): boolean
  unregister(type): boolean
  getAll(): Map<string, ComponentDefinition>
}
```

---

## 能力系统

### 定义能力键

```typescript
import { defineCapability } from '@spark-view/spark-component'

export const MY_CAP = defineCapability<{ doWork(): void }>('app:my-cap')
// MY_CAP 类型为 CapabilityKey<{ doWork(): void }>
```

### 提供 / 消费

```typescript
// Provider 组件
const { sparkProvide } = useSparkComponent({ type: 'parent' })
sparkProvide(MY_CAP, { doWork() { console.log('working') } })

// Consumer 组件（任意深度子孙）
const { sparkConsume } = useSparkComponent({ type: 'child' })
const cap = sparkConsume(MY_CAP)   // 类型推断为 { doWork(): void } | null
cap?.doWork()
```

### 内置能力键（来自 `@spark-view/spark-component`）

| 键 | 类型 | 说明 |
|---|---|---|
| `APP_SERVICES` | `IAppServicesCapability` | `{ router?, logger?, tenant?, configLoader?, authService? }` |
| `LOGGER` | `LoggerApi` | 覆盖当前子树的 logger |
| `PAGE_SERVICE` | `IPageServiceCapability` | `showMessage / showConfirm / showLoading / navigate` |

来自 `@spark-view/spark-data`：

| 键 | 类型 | 说明 |
|---|---|---|
| `PAGE_DATASET` | `IDataSet` | 页面级 DataSet，由 PageRenderer 提供 |
| `DATA_SOURCE` | `IDataSource` | 组件级 DataView，由容器组件提供 |

---

## Vue 插件

```typescript
import { createSparkPlugin } from '@spark-view/spark-component'

// 等价于 Spark.createPlugin()
const plugin = createSparkPlugin({ registry? })
app.use(plugin)
```

安装时向 Vue DI 注入：
- `SPARK_REGISTRY_KEY` → `ComponentRegistry` 实例
- 内部根能力上下文 → `rootContext`（空能力 Map，仅框架内部使用）

---

## 导出列表

```typescript
// 命名空间
export { Spark }

// 组件开发
export { useSparkComponent }
export type { UseSparkComponentReturn }

// Vue 插件
export { createSparkPlugin }
export type { SparkPluginOptions }

// 注册表
export { createComponentRegistry, getGlobalRegistry }

// 核心类型
export type {
  CapabilityName,
  ComponentConfig,
  SparkCapabilityContext,
  ComponentDefinition,
  ComponentRegistry,
  LoggerApi,
}

// DI Keys（Vue DI 用，仅基础设施场景）
export { SPARK_REGISTRY_KEY }

// 页面渲染引擎
export {
  SparkPageRenderer,
  SparkComponentRenderer,
  usePageDataSet,
}
export type {
  PageContext,
  PageConfig,
}
```

---

## 内置 SparkNode 组件目录（103 类型）

所有组件通过 `Spark.register()` 注册，在 `rule.json` 中以 `type` 引用。

### 容器组件 — 数据驱动（5 类型）

自解析 `dataKey`，提供 `DATA_SOURCE` 能力。

| type | 组件 | 说明 |
|------|------|------|
| `r-table` | RendererTable | DataView → el-table，自动行选中/高亮 |
| `r-form` | RendererForm | DataView.currentRow → reactive formModel |
| `r-detail` | RendererDetail | DataView.currentRow → 只读详情展示 |
| `r-tree` | RendererTree | DataView → el-tree，支持懒加载/嵌套 |
| `r-list` | RendererList | DataView → 列表渲染 |

### 容器组件 — 非数据驱动（37 类型）

纯布局/交互容器，透传 children。

| type | 组件 | 说明 |
|------|------|------|
| `r-tabs` | RendererTabs | el-tabs，子节点为 tab-pane |
| `r-collapse` | RendererCollapse | el-collapse，子节点为 collapse-item |
| `r-dialog` | RendererDialog | el-dialog 弹窗 |
| `r-drawer` | RendererDrawer | el-drawer 抽屉 |
| `r-steps` | RendererSteps | el-steps 步骤条 |
| `r-section` | RendererSection | 语义分区容器 |
| `r-toolbar` | RendererToolbar | 工具栏 |
| `r-row` | RendererRow | el-row 栅格行 |
| `r-col` | RendererCol | el-col 栅格列（span/offset/push/pull） |
| `r-card` | RendererCard | el-card 卡片 |
| `r-space` | RendererSpace | el-space 间距 |
| `r-divider` | RendererDivider | el-divider 分割线 |
| `r-button` | RendererButton | el-button（buttonType/size/icon/loading） |
| `r-link` | RendererLink | el-link 文字链接 |
| `r-page-header` | RendererPageHeader | el-page-header 页头 |
| `r-dropdown` | RendererDropdown | el-dropdown 下拉菜单 |
| `r-tooltip` | RendererTooltip | el-tooltip 文字提示 |
| `r-popover` | RendererPopover | el-popover 气泡弹出框 |
| `r-popconfirm` | RendererPopconfirm | el-popconfirm 气泡确认框 |
| `r-backtop` | RendererBacktop | el-backtop 回到顶部 |
| `r-carousel` | RendererCarousel | el-carousel 走马灯 |
| `r-carousel-item` | RendererCarouselItem | el-carousel-item 走马灯项 |
| `r-watermark` | RendererWatermark | el-watermark 水印 |
| `r-affix` | RendererAffix | el-affix 固钉 |
| `r-scrollbar` | RendererScrollbar | el-scrollbar 滚动条 |
| `r-tour` | RendererTour | el-tour 漫游式引导 |
| `r-anchor` | RendererAnchor | el-anchor 锚点导航 |
| `r-anchor-link` | RendererAnchorLink | el-anchor-link 锚点链接 |
| `r-container` | RendererContainer | el-container 布局容器（direction） |
| `r-aside` | RendererAside | el-aside 侧边栏（asideWidth） |
| `r-main` | RendererMain | el-main 主内容区 |
| `r-layout-header` | RendererLayoutHeader | el-header 布局顶栏（headerHeight） |
| `r-layout-footer` | RendererLayoutFooter | el-footer 布局底栏（footerHeight） |
| `r-button-group` | RendererButtonGroup | el-button-group 按钮组 |
| `builtin-action` | BuiltinActionButton | 内置操作按钮（增删改查） |

### 展示组件 — 数据驱动（7 类型）

绑定 DataView 字段数据，通过 `useDisplayDataSource` 读取。

| type | 组件 | 说明 |
|------|------|------|
| `r-statistic` | DisplayStatistic | el-statistic 统计数值 |
| `r-progress` | DisplayProgress | el-progress 进度条 |
| `r-tag` | DisplayTag | el-tag 标签 |
| `r-badge` | DisplayBadge | el-badge 徽章 |
| `r-avatar` | DisplayAvatar | el-avatar 头像 |
| `r-text-display` | DisplayText | el-text 文本展示 |
| `r-pagination` | DisplayPagination | el-pagination 分页 |

### 展示组件 — 非数据驱动（14 类型）

静态/配置驱动的展示元素。

| type | 组件 | 说明 |
|------|------|------|
| `r-descriptions` | DisplayDescriptions | el-descriptions 描述列表 |
| `r-descriptions-item` | DisplayDescriptionsItem | el-descriptions-item 描述项 |
| `r-timeline` | DisplayTimeline | el-timeline 时间线 |
| `r-timeline-item` | DisplayTimelineItem | el-timeline-item 时间线项 |
| `r-alert` | DisplayAlert | el-alert 提示 |
| `r-empty` | DisplayEmpty | el-empty 空状态 |
| `r-result` | DisplayResult | el-result 结果页 |
| `r-breadcrumb` | DisplayBreadcrumb | el-breadcrumb 面包屑 |
| `r-breadcrumb-item` | DisplayBreadcrumbItem | el-breadcrumb-item 面包屑项 |
| `r-skeleton` | DisplaySkeleton | el-skeleton 骨架屏 |
| `display-image` | DisplayImage | el-image 图片展示 |
| `display-calendar` | DisplayCalendar | el-calendar 日历 |
| `display-countdown` | DisplayCountdown | el-countdown 倒计时 |
| `display-icon` | DisplayIcon | el-icon 图标（动态解析 @element-plus/icons-vue） |

### 区域组件（6 类型）

容器内结构化槽位（header/footer/actions/filter/editor/tail）。

| type | 组件 | 说明 |
|------|------|------|
| `r-toolbar` | RendererToolbar | 操作按钮区（含工具栏与 actions 区） |
| `r-filter` | RendererFilter | 筛选条件区 |
| `r-editor` | RendererEditor | 编辑区 |
| `r-header` | RendererHeader | 容器顶部操作栏（div 弹性布局，非 el-header） |
| `r-footer` | RendererFooter | 容器底部操作栏（div 弹性布局，非 el-footer） |
| `r-tail` | RendererTail | 尾部扩展区 |

### 字段组件（32 类型）

表单字段，支持 DataView 双向绑定 + 权限渲染。

| type | 组件 | 说明 |
|------|------|------|
| `r-text` | FieldText | el-input 文本输入 |
| `r-textarea` | FieldTextarea | el-input textarea 多行 |
| `r-html-editor` | FieldHtmlEditor | 富文本编辑器 |
| `r-number` | FieldNumber | el-input-number 数字输入 |
| `r-date` | FieldDate | el-date-picker（dateType 支持 date/datetime/daterange/monthrange 等全类型） |
| `r-select` | FieldSelect | el-select 下拉选择 |
| `r-multi-select` | FieldMultiSelect | el-select 多选模式 |
| `r-radio` | FieldRadio | el-radio-group 单选 |
| `r-checkbox` | FieldCheckbox | el-checkbox 复选框 |
| `r-checkbox-group` | FieldCheckboxGroup | el-checkbox-group 复选组 |
| `r-switch` | FieldSwitch | el-switch 开关 |
| `r-slider` | FieldSlider | el-slider 滑块 |
| `r-rate` | FieldRate | el-rate 评分 |
| `r-color` | FieldColor | el-color-picker 颜色选择 |
| `r-icon` | FieldIcon | 图标选择器 |
| `r-image` | FieldImage | 图片选择/预览 |
| `r-file-path` | FieldFilePath | 文件路径输入 |
| `r-file-browser` | FieldFileBrowser | 文件浏览器 |
| `r-upload` | FieldUpload | el-upload 文件上传 |
| `r-entity-picker` | FieldEntityPicker | 实体选择器 |
| `r-user-picker` | FieldUserPicker | 用户选择器 |
| `r-dept-picker` | FieldDeptPicker | 部门选择器 |
| `r-product-picker` | FieldProductPicker | 产品选择器 |
| `r-cascader` | FieldCascader | el-cascader 级联选择 |
| `r-tree-select` | FieldTreeSelect | el-tree-select 树选择 |
| `r-transfer` | FieldTransfer | el-transfer 穿梭框 |
| `r-segmented` | FieldSegmented | el-segmented 分段控制器 |
| `r-check-tag` | FieldCheckTag | el-check-tag 可选标签 |
| `r-mention` | FieldMention | el-mention @提及 |
| `r-time-picker` | FieldTimePicker | el-time-picker 时间选择 |
| `r-time-select` | FieldTimeSelect | el-time-select 时间下拉 |
| `r-autocomplete` | FieldAutocomplete | el-autocomplete 自动补全 |

### 基础设施组件（2 类型）

| type | 组件 | 说明 |
|------|------|------|
| `r-column-group` | FieldContextRenderer | 表格列分组/字段上下文渲染 |
| `r-tree-node-summary` | TreeNodeSummary | 树节点摘要展示 |

> **注意**：`r-header`/`r-footer`（区域组件）与 `r-layout-header`/`r-layout-footer`（Layout）是不同组件——区域组件是容器内操作栏（div 弹性布局），Layout 是 el-header/el-footer 页面结构容器。
