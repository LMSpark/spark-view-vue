/**
 * 组件补充数据（构建时与 VCM 提取合并）
 *
 * - SHARED_TYPE_DEFINITIONS: 框架级共享类型（SparkNode 等），catalog 顶层 sharedTypes 单例定义
 * - COMPONENT_CATEGORIES: 无法从目录/SFC 自动推断的组件分类
 *
 * @module component-props-supplement
 */

import type { SharedTypeDefinition } from './component-catalog-schema'

/* ==========================================================================
 * 共享类型定义（SparkNode 家族）
 *
 * 这些类型会写入 catalog 顶层 sharedTypes，单例定义、全局引用。
 * 组件 props 中出现 SparkNode[] 等类型时不再展开 schema，
 * AI 查阅 sharedTypes 即可理解完整结构。
 * ========================================================================== */

export const SHARED_TYPE_DEFINITIONS: Record<string, SharedTypeDefinition> = {
  SparkNode: {
    name: 'SparkNode',
    description: '组件配置节点 —— 严格对齐 Vue h(type, props, children) 三段式。rule.json 中 dataKey/field/id/on/visible/disabled/dock 等可写在根级（便于阅读），绑定阶段（buildPageChildren）会全部收入 props。',
    properties: [
      { name: 'type', type: 'string', required: true, description: '组件类型（kebab-case），映射到 ComponentRegistry 中的注册名，如 "r-table"、"r-text"、"el-button"' },
      { name: 'props', type: 'Record<string, unknown>', description: '组件属性，透传到 Vue 组件 props（v-bind 展开）。绑定阶段会将根级的 id/dataKey/field/label/optionKey/on/visible/disabled/dock/docks 等全部收入此处' },
      { name: 'children', type: 'SparkNode[]', description: '子组件配置（递归结构），容器组件渲染其 children 形成组件树' },
    ],
    notes: `【h(type, props, children) 三段式】
SparkNode 仅保留 3 个根级字段，与 Vue h() 函数一一对应：
- type → 渲染什么组件
- props → 组件接收的全部属性（id/dataKey/field/label/on/visible/disabled/dock/docks 均在此）
- children → 嵌套子节点

rule.json 允许将 dataKey/field/id/on/visible/disabled 等写在根级（便于阅读），
绑定阶段（buildPageChildren）会全部收入 props，组件代码只需关心 props。

【常用 props 字段说明】
- id: string — 实例 ID（可选，运行时自动生成 spark-{n}）
- dataKey: string — 数据绑定键（如 "Users@rows"），容器组件自行解析为 DataView
- field: string — 字段绑定名，定位到 DataView 行中的数据字段
- label: string — 显示标签（UI 展示文字）
- optionKey: string — 选项数据源 DataKey（供 r-select/r-radio 等解析选项列表）
- on: Record<string, string> — 事件绑定（key=camelCase 事件名，value=script.js 函数名）
- visible: boolean — 可见性控制
- disabled: boolean — 禁用状态控制
- dock: string — 停靠区域名（toolbar/actions/filter/header/footer）
- docks: object — 容器停靠区域显示配置

【动态渲染流程】
rule.json → SparkNode 树
  → SparkComponentRenderer 递归遍历
  → 每个节点：registry.get(node.type) → 渲染对应 Vue 组件
  → 容器组件 provide(DATA_SOURCE, CONTEXT_DATA)
  → 子组件 consume() 获取数据与语境 → 自适应渲染`,
  },
}

/* ==========================================================================
 * 组件分类（仅保留无法从目录/SFC 自动推断的条目）
 *
 * 大部分组件分类已通过目录推断（containers/ → container, fields/ → field）
 * 或 SFC @category 注解声明。此处仅保留元概念和特殊映射。
 * ========================================================================== */

export type ComponentCategory = 'container' | 'field' | 'group' | 'meta'

export const COMPONENT_CATEGORIES: Record<string, ComponentCategory> = {
  // 分组（注册为 FieldContextRenderer 别名，无独立 SFC）
  'r-column-group': 'group',
  // 元概念（不进入注册表，无 SFC 文件）
  'builtin-action': 'meta',
  'context-aware-fields-api': 'meta',
}
