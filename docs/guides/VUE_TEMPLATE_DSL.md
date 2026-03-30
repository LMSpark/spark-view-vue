# Vue Template DSL 指南

## 定位

Vue Template DSL 面向组件树作者，适合在 Vue 单文件组件里用模板语法快速描述 SPARK 组件结构。

- 它擅长局部页面、演示页、业务组件组合。
- 它不替代 rule.json 页面系统；页面级配置、AI 生成、script.js、style.css、完整页面资产仍以 rule 方案为主。
- 当前运行时的权威结构模型是包装节点，不是旧的 dock / order 语义。

## 当前规则

- 命名插槽会被编译成包装节点。
- 常用包装节点有：r-toolbar、r-filter、r-actions、r-header、r-footer、r-tail。
- props.docks.* 只控制这些区域的展示参数，不承载结构节点。
- 模板里的旧属性 dock、order 会被忽略，不应继续使用。

## RTable 示例

```vue
<template>
  <RTable
    dataKey="Users@rows"
    :border="true"
    :highlight-current-row="true"
    :docks="{
      filter: { gridColumns: 12, collapsible: true },
      actions: { width: 180, fixed: 'right' }
    }"
  >
    <template #toolbar>
      <BuiltinAction builtinAction="refresh" />
      <el-button type="primary">新增</el-button>
    </template>

    <template #filter>
      <RText field="name" label="姓名" />
      <RSelect field="status" label="状态" :options="statusOptions" />
    </template>

    <template #actions>
      <el-button link type="primary">编辑</el-button>
      <el-button link type="danger">删除</el-button>
    </template>

    <el-table-column prop="name" label="姓名" width="180" />
    <el-table-column prop="status" label="状态" width="120" />
  </RTable>
</template>
```

上面的模板会编译成等价的结构：

```json
{
  "type": "r-table",
  "dataKey": "Users@rows",
  "props": {
    "border": true,
    "highlightCurrentRow": true,
    "docks": {
      "filter": { "gridColumns": 12, "collapsible": true },
      "actions": { "width": 180, "fixed": "right" }
    }
  },
  "children": [
    {
      "type": "r-toolbar",
      "children": [
        { "type": "builtin-action", "props": { "builtinAction": "refresh" } },
        { "type": "el-button", "props": { "type": "primary" }, "children": ["新增"] }
      ]
    },
    {
      "type": "r-filter",
      "children": [
        { "type": "r-text", "props": { "field": "name", "label": "姓名" } },
        { "type": "r-select", "props": { "field": "status", "label": "状态" } }
      ]
    },
    {
      "type": "r-actions",
      "children": [
        { "type": "el-button", "props": { "link": true, "type": "primary" }, "children": ["编辑"] },
        { "type": "el-button", "props": { "link": true, "type": "danger" }, "children": ["删除"] }
      ]
    },
    { "type": "el-table-column", "props": { "prop": "name", "label": "姓名", "width": "180" } },
    { "type": "el-table-column", "props": { "prop": "status", "label": "状态", "width": "120" } }
  ]
}
```

## 其他容器

- RDialog / RDrawer：用 #header、#footer 生成 r-header、r-footer。
- RTabs / RCollapse / RSteps：#toolbar 会生成 r-toolbar。
- RToolbar：#tail 会生成 r-tail。
- RForm / RDetail：#toolbar 会生成 r-toolbar，默认插槽保留字段节点。

## 适用边界

优先选 Vue Template DSL 的场景：

- 需要在 Vue 组件里共置模板、状态和交互。
- 需要快速搭建演示页或组合式业务块。
- 页面结构主要由前端手写，而不是由 AI 或配置中心生成。

优先选 rule.json 的场景：

- 需要完整页面资产：rule.json、pagedata.json、script.js、style.css。
- 需要 AI 页面生成、页面配置存储、后端页面管理。
- 需要让非前端开发者以配置方式维护页面。

## Demo

- 路由：/demo/template-dsl
- 组件页：src/views/app/TemplateDslDemo.vue
- 路由映射：src/config/vue-page-map.ts